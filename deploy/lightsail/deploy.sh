#!/bin/bash
# Deploys a version: settings → images → start → certificate → check. Run ON THE SERVER as root, in /opt/ktrg-lightsail:
#
#   ./deploy.sh                   # builds whatever is in ./src right now
#   ./deploy.sh mylabel           # same, but records "mylabel" (e.g. a commit hash) in .tag for your own reference
#
# No ECR here (this host is amd64, EC2's images are ARM64-only, and anupap has no push rights) -- web/api are built
# straight from ./src each deploy; db/nginx/certbot/pgadmin/backup_s3 pull their official multi-arch images as-is.
# Before running this, refresh ./src from the latest commit (see move-files.sh-style step in the chat history):
#   rm -rf src && mkdir src && aws s3 cp s3://dev-ktrg-lightsail-backups-712723095627/deploy/ktrg-src.tar.gz - | tar -xz -C src
#
# Get the newest compose file, nginx config and scripts first:
#   aws s3 sync s3://dev-ktrg-lightsail-backups-712723095627/deploy/lightsail/ /opt/ktrg-lightsail/
set -euo pipefail
cd /opt/ktrg-lightsail
SSM_REGION=ap-northeast-1   # where /ktrg/lightsail/env lives (Tokyo, same as this server)
chmod +x ./*.sh nginx/*.sh
[ -d src ] || { echo "no ./src -- see the comment at the top of this file"; exit 1; }

# ---- 1. A label for this build (just bookkeeping -- there's no registry tag to roll back to on this host) --------
TAG="${1:-$(date -u +%Y%m%dT%H%M%SZ)}"
echo "== deploying $TAG"

# ---- 2. Settings: Parameter Store /ktrg/lightsail/env → .env ---------------------------------------------------
# umask 077: the new .env is readable by root only (it holds the passwords). Any TAG= line in the settings is
# dropped so the version always comes from here.
umask 077
{
  aws ssm get-parameter --region $SSM_REGION --name /ktrg/lightsail/env --with-decryption --query Parameter.Value --output text |
    grep -v '^TAG='
  echo "TAG=$TAG"
} > .env.new
mv .env.new .env
umask 022
echo "$TAG" > .tag
setting() { grep -m1 "^$1=" .env | cut -d= -f2-; }
DOMAIN="$(setting DOMAIN)"

# ---- 3. Images ----------------------------------------------------------------------------------------------------
docker compose build --pull api web
docker compose pull db nginx certbot pgadmin backup_s3 --quiet

# ---- 4. Start -----------------------------------------------------------------------------------------------------
# Only containers whose image or settings changed are replaced; migrate runs first and the api waits for it.
mkdir -p certbot/conf certbot/www
docker compose up -d --remove-orphans

# ---- 5. HTTPS certificate -----------------------------------------------------------------------------------------
# Get one when there is none yet, or when it does not cover DOMAIN (the domain changed). Renewal is the timer's job.
CERT=certbot/conf/live/ktrg/fullchain.pem
if ! { [ -f "$CERT" ] && openssl x509 -in "$CERT" -noout -ext subjectAltName | grep -qF "DNS:$DOMAIN"; }; then
  echo "== getting a certificate for $DOMAIN"
  docker compose run --rm certbot certonly --webroot -w /var/www/certbot --cert-name ktrg -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email </dev/null
  docker compose restart nginx
fi

# ---- 6. Check -----------------------------------------------------------------------------------------------------
# Through nginx and HTTPS, as a visitor would (--resolve: ask this server, not DNS). The api needs a few seconds.
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/v1/health" || true)"
  [ "$code" = 200 ] && break
  sleep 2
done
docker image prune -f >/dev/null # old images no container uses any more
docker compose ps
if [ "$code" = 200 ]; then
  echo "== deployed $TAG: https://$DOMAIN is up"
else
  echo "== deployed $TAG, but https://$DOMAIN/api/v1/health answers $code. Look at: docker compose logs api --tail 50"
  exit 1
fi
