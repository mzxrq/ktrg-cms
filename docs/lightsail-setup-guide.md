# Lightsail setup guide: step by step

How to put the same ktrg site on **one Amazon Lightsail instance** instead of one EC2 instance, in the order to do
it, with what each command does and why. The containers, the nginx config, the database and almost every script in
[deploy/aws/](../deploy/aws/) stay the same; what changes is the machine around them (region, architecture, how the
server gets AWS permissions, how you log in, and how a deploy is triggered).

Read [aws-setup-guide.md](aws-setup-guide.md) first if you want the reasoning behind the parts that are unchanged;
this guide repeats only what Lightsail does differently, and gives every command in full. Day-to-day operation is in
[deploy/aws/README.md](../deploy/aws/README.md).

```
visitor ─https─> nginx ─/api/*───> api:3001 ──> db:5432 (PostgreSQL 18)
                       ├─/files/*─> storage_data volume (photos, videos)
                       └─other────> web:3000 (Next.js) ──> api:3001
```

| Part | Steps |
| --- | --- |
| A. Your PC and AWS | 0 terminal · 1 IAM user for the server · 2 ECR · 3 S3 · 4 Lightsail instance, static IP, firewall |
| B. The server | 5 logging in · 6 credentials on the server · 7 host setup |
| C. The app | 8 code · 9 compose + nginx · 10 settings · 11 images · 12 start · 13 HTTPS |
| D. The data | 14 Supabase → S3 → server · 15 files from R2 |
| E. Running it | 16 timers · 17 deploy.sh · 18 pgAdmin · 19 snapshots and alarms · 20 CI/CD · 21 clean-up and resizing |
| | [What is different from EC2](#what-is-different-from-ec2) · [Lessons learned](#lessons-learned) |

## What is different from EC2

| | EC2 (the existing guide) | Lightsail (this guide) |
| --- | --- | --- |
| Region | Osaka, `ap-northeast-3` | **Lightsail is not offered in Osaka.** Use **Tokyo, `ap-northeast-1`** |
| Machine | t4g.small, paid per hour plus per GB out | a fixed-price bundle (2 GB RAM about $12 a month, 60 GB SSD, 3 TB transfer included) |
| CPU | ARM64 (Graviton) | **x86-64**: images must be built `linux/amd64`, so the ARM tags already in ECR cannot be reused |
| Firewall | security group `ktrg-web` | the instance's own Lightsail firewall, same ports |
| Fixed address | Elastic IP | static IP (free while attached; 5 per region) |
| Server permissions | an **IAM role** on the instance, no key stored anywhere | **Lightsail instances have no role**: an **IAM user's access key** sits on the server. The one real security downgrade; see step 1 |
| Logging in | Session Manager, port 22 closed | SSH key, port 22 open to your own IP only, or the console's browser SSH |
| Metrics and alarms | CloudWatch agent plus the `ktrg-*` alarms | Lightsail's own metrics and alarms (CPU, transfer, status check); memory and disk still need the CloudWatch agent |
| Disk backup | EBS snapshot by hand | **automatic daily snapshots**, one command, $0.05 per GB-month |
| Changing size | change the instance type | not possible in place: snapshot → new instance → move the IP (step 21) |
| Deploy trigger from CI | `ssm send-command` to the instance | the server pulls, or Actions connects by SSH; see step 20 |

Unchanged: ECR, S3, SSM Parameter Store, Docker Compose, nginx, Certbot, pgAdmin, the systemd timers, `deploy.sh`,
the backup and restore scripts, and the GitHub OIDC role.

**Where to keep the other AWS pieces.** ECR, the S3 bucket and Parameter Store already exist in Osaka and work from
another region, so the simplest move is: the Lightsail instance in Tokyo, everything else left in Osaka, and **no
script changes at all** (`deploy.sh`, `alarms-setup.sh` and `docker-compose.yml` have `ap-northeast-3` written into
them). The cost is a little latency and cross-region transfer on each image pull (a few hundred MB). To keep
everything in one region instead, make a Tokyo bucket and Tokyo ECR repositories, then change `REGION=`,
`AWS_REGION=` and `AWS_DEFAULT_REGION:` in `deploy/aws/deploy.sh`, `aws-setup.sh`, `cicd-setup.sh` and
`docker-compose.yml`, plus `REGISTRY=` and `S3_BUCKET_NAME=` in the settings.

Prices and the region list below were read from AWS's pricing and documentation pages on **2026-11-16**; check them
again before relying on them. The claim that a Lightsail instance cannot carry an IAM role is not stated in the
Lightsail IAM documentation either way — it is what the console and `create-instances` offer (no instance profile
anywhere), and what AWS's own forum answers say. Confirm it in the console before designing around it.

---

## A. Your PC and AWS

### Step 0: the terminal

Use **Git Bash** in VS Code (Terminal → New Terminal → ▾ → Git Bash), in the project folder:

```bash
cd ~/Desktop/work/ktrg-cms
export AWS_PROFILE=ktrg            # every aws command logs in as the IAM user ktrg-admin
export AWS_REGION=ap-northeast-3   # Osaka: ECR, S3 and Parameter Store stay there
export MSYS_NO_PATHCONV=1          # stop Git Bash turning /ktrg/env into C:/Program Files/Git/ktrg/env
aws sts get-caller-identity        # "who am I?": must show user/ktrg-admin in account 712723095627
```

Lightsail lives in another region, so give it on each Lightsail command: `aws lightsail … --region ap-northeast-1`.
The `export` lines last only for that terminal; add them to `~/.bashrc` to have them in every new one.

### Step 1: an IAM user for the server (instead of a role)

A Lightsail instance cannot be given an IAM role, so the server needs an access key of its own. Keep it as narrow as
the role was: the backup bucket, the `/ktrg/*` settings, metrics, and read-only ECR. Nothing else.

```bash
ACCOUNT=712723095627
BUCKET=ktrg-backups-$ACCOUNT

cat > server-policy.json <<POLICY
{ "Version": "2012-10-17", "Statement": [
  { "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": "arn:aws:s3:::$BUCKET" },
  { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"], "Resource": "arn:aws:s3:::$BUCKET/*" },
  { "Effect": "Allow", "Action": ["ssm:GetParameter"],
    "Resource": "arn:aws:ssm:ap-northeast-3:$ACCOUNT:parameter/ktrg/*" },
  { "Effect": "Allow", "Action": ["cloudwatch:PutMetricData"], "Resource": "*" } ] }
POLICY

aws iam create-user --user-name ktrg-server
aws iam put-user-policy --user-name ktrg-server --policy-name ktrg-server \
  --policy-document file://server-policy.json
aws iam attach-user-policy --user-name ktrg-server \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
rm server-policy.json
aws iam create-access-key --user-name ktrg-server     # the secret is shown ONCE: take it straight to step 6
```

The secret is printed once and never again. Do not put it in a file in the repository, in chat, or in Parameter
Store. If it leaks: `aws iam delete-access-key --user-name ktrg-server --access-key-id <id>`, make a new one and redo
step 6. Rotate it the same way on a fixed day every few months (new key → write it on the server → check a deploy
works → delete the old key).

The key must **not** be allowed to push to ECR: a broken-into server must not be able to replace your images. The
build gets push rights separately and briefly (step 11).

### Step 2: ECR repositories

Already made by `bash deploy/aws/aws-setup.sh 3`; nothing to redo. The three repositories (`ktrg-cms`, `ktrg-web`,
`ktrg-db`) hold images of any architecture, so the new x86 images just get their own tags. Keep the ARM tags until
the Lightsail server works, so the EC2 server can still be deployed meanwhile.

### Step 3: S3 backup bucket

Already made by `bash deploy/aws/aws-setup.sh 5` (`ktrg-backups-712723095627`); nothing to redo. While both servers
run, each one's daily database dump and file sync would overwrite the other's: leave the timers off on the new
server (step 16) until you are ready to retire the old one.

### Step 4: the Lightsail instance, static IP and firewall

Do not guess the bundle and blueprint names; ask for them:

```bash
R=ap-northeast-1

# the blueprint (operating system): Amazon Linux 2023, as on EC2
aws lightsail get-blueprints --region $R \
  --query "blueprints[?contains(blueprintId,'amazon_linux_2023')].[blueprintId,name]" --output text

# the bundles (size and price): the 2 GB one, about $12 a month
aws lightsail get-bundles --region $R \
  --query 'bundles[?ramSizeInGb>=`2`].[bundleId,price,cpuCount,ramSizeInGb,diskSizeInGb,transferPerMonthInGb]' \
  --output table
```

| Setting | Value | Why |
| --- | --- | --- |
| bundle | 2 GB RAM, 2 vCPU, 60 GB SSD, 3 TB transfer | the same memory as t4g.small, at a fixed monthly price |
| blueprint | `amazon_linux_2023` | the system the scripts were written for |
| key pair | `ktrg`, made below | there is no Session Manager here |
| ports | 80 and 443 to everyone, 22 to your IP only | the EC2 guide's step 2, by another means |
| address | a static IP | free while it is attached to an instance |

```bash
R=ap-northeast-1
ZONE=${R}a

# an SSH key pair; the private key is shown once, so save it as it is created
aws lightsail create-key-pair --region $R --key-pair-name ktrg \
  --query privateKeyBase64 --output text > ~/.ssh/ktrg.pem
chmod 400 ~/.ssh/ktrg.pem

aws lightsail create-instances --region $R \
  --instance-names ktrg-cms \
  --availability-zone $ZONE \
  --blueprint-id amazon_linux_2023 \
  --bundle-id <the bundle id from above> \
  --key-pair-name ktrg

aws lightsail allocate-static-ip --region $R --static-ip-name ktrg-ip
aws lightsail attach-static-ip   --region $R --static-ip-name ktrg-ip --instance-name ktrg-cms

MYIP=$(curl -s https://checkip.amazonaws.com)
aws lightsail put-instance-public-ports --region $R --instance-name ktrg-cms --port-infos \
  fromPort=80,toPort=80,protocol=TCP \
  fromPort=443,toPort=443,protocol=TCP \
  fromPort=22,toPort=22,protocol=TCP,cidrs=$MYIP/32

aws lightsail get-instance --region $R --instance-name ktrg-cms \
  --query 'instance.[name,state.name,publicIpAddress,bundleId]' --output text
```

`put-instance-public-ports` **replaces every rule**, so always send all three lines together: a command with only
port 22 in it would close the site. A home or office address usually changes, so when SSH stops working, run that
command again from the new network — or use the console's browser SSH, which needs no key and no rule of yours.

Nothing else is open: not 3000, not 3001, not 5432. The database and pgAdmin stay inside Docker.

---

## B. The server

### Step 5: logging in

```bash
ssh -i ~/.ssh/ktrg.pem ec2-user@<static ip>
sudo -i                                  # become root; leave with exit twice
```

Or **Lightsail console → Instances → ktrg-cms → Connect using SSH**: a browser terminal, no key needed. That is the
way in when your own address has changed.

| Prompt | You are on |
| --- | --- |
| `user@KAN-hp-122 MINGW64 ~/Desktop/work/ktrg-cms` | your PC |
| `[root@ip-172-26-… ~]#` | the server |

### Step 6: the AWS credentials on the server

This replaces the instance role, and it comes before anything that runs `aws` on the server.

```bash
# server, as root
mkdir -p /root/.aws
cat > /root/.aws/credentials <<CREDS
[default]
aws_access_key_id = AKIA…
aws_secret_access_key = …
CREDS
chmod 700 /root/.aws && chmod 600 /root/.aws/credentials
printf '[default]\nregion = ap-northeast-3\n' > /root/.aws/config
aws sts get-caller-identity          # must show user/ktrg-server
```

The `backup_s3` container runs as user 1000 with `HOME=/tmp`, so it cannot read root's file. Give it a read-only
copy of its own:

```bash
# server
mkdir -p /opt/ktrg/aws
cp /root/.aws/credentials /opt/ktrg/aws/credentials
chown -R 1000:1000 /opt/ktrg/aws && chmod 600 /opt/ktrg/aws/credentials
```

and add one line to the `backup_s3` service in `deploy/aws/docker-compose.yml` — the only change the compose file
needs for Lightsail:

```yaml
    volumes:
      - storage_data:/data:ro
      - /opt/ktrg/aws:/tmp/.aws:ro      # Lightsail has no instance role: the key, read-only
```

The alternative, if you would rather not mount a file, is `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in the
settings (step 10), listed under the service's `environment:`. That puts the key into Parameter Store and into
`.env` as well as on the disk, which is why the mount is the default here.

### Step 7: host setup

The same script as on EC2, and it needs no change: the Docker Compose plugin it installs is chosen by architecture.

```bash
# your PC
aws s3 sync deploy/aws s3://ktrg-backups-712723095627/deploy/aws/ --exclude ".env*" --delete
# server
mkdir -p /opt/ktrg && cd /opt/ktrg
aws s3 sync s3://ktrg-backups-712723095627/deploy/aws/ /opt/ktrg/ && chmod +x /opt/ktrg/*.sh nginx/*.sh
bash server-setup.sh
```

It does `dnf update`, a 2 GB swap file with `vm.swappiness=10`, Docker with log rotation, the Compose plugin, and the
CloudWatch agent (memory and disk every minute — which works here only because of step 6). Check: `free -h` shows
`Swap: 2.0Gi`, and `docker run hello-world` prints `Hello from Docker!`.

---

## C. The app

Steps 8 to 10 and 12 to 13 are the EC2 guide's steps 8 to 10 and 12 to 13, unchanged; only step 11 is different.

### Step 8: the code the server needs

Unchanged: the Dockerfiles that install packages in the final image, `apps/api/scripts/migrate.ts`, uploads on disk
(`UPLOADS_DIR`), Cloudflare's visit-place headers, and the LF line endings `.gitattributes` keeps on `.sh` and
`deploy/aws/`. Check it still fits: `bun install --frozen-lockfile`, `bun run --cwd apps/api typecheck`,
`bun run --cwd apps/api test`.

### Step 9: docker-compose.yml and nginx

Unchanged apart from the one `backup_s3` volume line in step 6. nginx is still the only container with ports, the
rate limit and `/files/` are the same, and `docker compose config -q` still checks the file on your PC.

### Step 10: the settings (.env)

Unchanged in shape: `deploy/aws/.env.production` on your PC → Parameter Store `/ktrg/env` (encrypted) →
`/opt/ktrg/.env` on the server. Two values change for the new server:

- `DOMAIN=` the new address. Until there is a real domain, the sslip.io form of the **static IP**, with dashes:
  `DOMAIN=13-230-1-2.sslip.io`.
- `APP_ORIGIN=https://<that domain>`, and `API_ORIGIN` / `SITE_URL` to match.

```bash
aws ssm put-parameter --name /ktrg/env --type SecureString --overwrite --value file://deploy/aws/.env.production
aws ssm get-parameter --name /ktrg/env --with-decryption --query Parameter.Value --output text | cut -d= -f1
```

Changing `APP_ORIGIN` **invalidates every passkey** registered against the old address, and `API_ORIGIN` is baked
into the web image at build time — so change these before step 11, not after. Save the file with **LF** line endings.

### Step 11: build the images (x86 this time)

The bundle is x86-64, so the ARM images in ECR will not run on it. Build on the server itself again: it is the
architecture the images need, so there is no emulation.

```bash
# your PC: commit, pack the committed code, upload it
git archive --format=tar.gz -o ktrg-src.tar.gz HEAD
aws s3 cp ktrg-src.tar.gz s3://ktrg-backups-712723095627/deploy/ktrg-src.tar.gz && rm ktrg-src.tar.gz

# your PC: let the server push to ECR, for this build only
cat > ecr-push.json <<PUSH
{ "Version": "2012-10-17", "Statement": [ { "Effect": "Allow",
  "Action": ["ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage"],
  "Resource": ["arn:aws:ecr:ap-northeast-3:712723095627:repository/ktrg-cms",
               "arn:aws:ecr:ap-northeast-3:712723095627:repository/ktrg-web",
               "arn:aws:ecr:ap-northeast-3:712723095627:repository/ktrg-db"] } ] }
PUSH
aws iam put-user-policy --user-name ktrg-server --policy-name ecr-push-temp --policy-document file://ecr-push.json
rm ecr-push.json
```

```bash
# server
cd /opt/ktrg && rm -rf src && mkdir src
aws s3 cp s3://ktrg-backups-712723095627/deploy/ktrg-src.tar.gz - | tar -xz -C src && cd src
REGISTRY=712723095627.dkr.ecr.ap-northeast-3.amazonaws.com
TAG=$(date +%Y%m%d-%H%M)-amd64            # the architecture in the tag: the ARM tags are still in ECR
aws ecr get-login-password --region ap-northeast-3 | docker login --username AWS --password-stdin $REGISTRY
docker build -f apps/api/Dockerfile -t $REGISTRY/ktrg-cms:$TAG .
docker build -f apps/web/Dockerfile -t $REGISTRY/ktrg-web:$TAG .
docker pull postgres:18-alpine && docker tag postgres:18-alpine $REGISTRY/ktrg-db:18-alpine
docker push $REGISTRY/ktrg-cms:$TAG
docker push $REGISTRY/ktrg-web:$TAG
docker push $REGISTRY/ktrg-db:18-alpine
echo "TAG=$TAG"
```

**Do not tag these `latest`** while the ARM server still exists: `latest` is what a deploy there pulls when given no
tag, and an x86 image on an ARM machine fails with `exec format error`.

The website build (Next.js) is the heavy part: it wants well over 1 GB, so on the 2 GB bundle it leans on the swap
from step 7 and takes several minutes. If it is killed (`exit code 137` means out of memory), build it on a bigger
bundle once (step 21 explains resizing) or let GitHub Actions build it (step 20) — Actions' standard machines are
x86, so no emulation is needed there either, which is simpler than it was for ARM.

Afterwards:

```bash
# your PC: take the push rights away again
aws iam delete-user-policy --user-name ktrg-server --policy-name ecr-push-temp
# server: clean up the build
cd /opt/ktrg && rm -rf src && docker builder prune -af && docker image prune -af && df -h /
```

### Step 12: start everything

Unchanged. By hand the first time; later `deploy.sh` (step 17) does all of it.

```bash
# server
cd /opt/ktrg
aws s3 sync s3://ktrg-backups-712723095627/deploy/aws/ /opt/ktrg/ && chmod +x *.sh nginx/*.sh
aws ssm get-parameter --name /ktrg/env --with-decryption --query Parameter.Value --output text > .env
echo "TAG=<tag from step 11>" >> .env
chmod 600 .env                         # root only: it holds the passwords
mkdir -p certbot/conf certbot/www
REGISTRY=712723095627.dkr.ecr.ap-northeast-3.amazonaws.com
aws ecr get-login-password --region ap-northeast-3 | docker login --username AWS --password-stdin $REGISTRY
docker compose pull
docker compose up -d
docker compose ps
docker compose exec nginx nginx -t     # "syntax is ok", "test is successful"
```

`ktrg-migrate` showing `Exited` is correct: it ran and stopped. At this point `http://<domain>/` answers `301` and
HTTPS is not on yet.

### Step 13: HTTPS certificate

Unchanged — and this is the step that proves the firewall is right, because Let's Encrypt must reach port 80 from the
internet.

```bash
# server
DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2)
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  --cert-name ktrg -d $DOMAIN --non-interactive --agree-tos --register-unsafely-without-email
docker compose restart nginx           # needed: only now does nginx turn HTTPS on
```

---

## D. The data

### Step 14: the database

Unchanged. From Supabase, on the server, one line at a time:

```bash
# server
./supabase-to-s3.sh                                     # prints Supabase's rows per table
./restore-from-s3.sh ktrg-<time>-supabase.sql.gz        # name the dump: the newest is not always the one you want
./count-rows.sh                                         # must match, table by table
```

To move the data from the EC2 server instead, run `./backup-db.sh` there and `./restore-from-s3.sh <that dump>`
here. Take that dump **after** the old site stops taking stamps, or the two databases drift apart.

Remember that the company network blocks outbound Postgres ports (5432, 6543): `supabase-to-s3.sh` must run on the
server, not on your PC at the office.

### Step 15: files from Cloudflare R2

Unchanged, with the new address:

```bash
# server
./move-files.sh https://<new domain>/files
docker restart s3_backup_cron           # back up the new files now instead of in 24 h
```

If the files are already on the old EC2 server, `./restore-from-s3.sh --with-files <dump>` brings the database and
the files from S3 in one go, which is faster than fetching everything from R2 again; then run `move-files.sh` with
the new address so the links in the content point at the new server.

---

## E. Running it

### Step 16: scheduled jobs

Unchanged — but only start them once this server is the real one, so the two servers do not overwrite each other's
backups in S3.

```bash
# server
bash timers-setup.sh
systemctl start ktrg-backup && journalctl -u ktrg-backup -n 5 --no-pager     # test one now
```

`ktrg-backup` daily 03:00 JST, `ktrg-certbot` at 00:00 and 12:00, `ktrg-purge` hourly.
`systemctl list-timers 'ktrg-*'` shows **UTC**: 18:03 UTC = 03:03 JST.

### Step 17: deploy.sh

Unchanged, and it needs no edit as long as ECR, S3 and Parameter Store stay in Osaka:

```bash
# server
aws s3 sync s3://ktrg-backups-712723095627/deploy/aws/ /opt/ktrg/ && chmod +x /opt/ktrg/*.sh
./deploy.sh <tag>     # a version in ECR
./deploy.sh           # the last version again: after changing a setting
```

Settings → `.env` → ECR login → `pull` → `up -d` → certificate if missing → health check through HTTPS. Roll back by
deploying an older **x86** tag.

### Step 18: pgAdmin

pgAdmin still listens on the server's 127.0.0.1:5050 only. Instead of a Session Manager tunnel, plain SSH port
forwarding:

```bash
# your PC
ssh -i ~/.ssh/ktrg.pem -L 5050:localhost:5050 -N ec2-user@<static ip>
```

Leave it running and open http://localhost:5050. Log in with `PGADMIN_EMAIL` / `PGADMIN_PASSWORD`, then Register →
Server: host **`db`** (inside Docker; `localhost` would be pgAdmin's own container), port 5432, and the `POSTGRES_*`
settings. The app's tables are in **your `POSTGRES_DB` → Schemas → public**. `Ctrl+C` closes the tunnel.

### Step 19: snapshots and alarms

**Automatic snapshots** are what Lightsail makes easy: a daily image of the whole disk, from which a new instance can
be built in minutes. They do not replace the database dumps (a snapshot can only be restored into a *new* instance,
never into the running one), but they cover a lost or broken server.

```bash
R=ap-northeast-1
aws lightsail enable-add-on --region $R --resource-name ktrg-cms \
  --add-on-request addOnType=AutoSnapshot,autoSnapshotAddOnRequest={snapshotTimeOfDay=18:00}
aws lightsail get-auto-snapshots --region $R --resource-name ktrg-cms
```

`snapshotTimeOfDay` is **UTC**: 18:00 UTC = 03:00 JST, the quiet hour the database backup already uses. Lightsail
keeps the last 7 automatic snapshots, at $0.05 per GB-month. Before a risky change, take one by hand:
`aws lightsail create-instance-snapshot --region $R --instance-snapshot-name ktrg-before-<what> --instance-name ktrg-cms`.

**Alarms.** `deploy/aws/alarms-setup.sh` is written for EC2 (it uses the instance id and EC2's auto-recover action),
so do not run it here. Lightsail has its own alarms on its own metrics:

```bash
R=ap-northeast-1
aws lightsail create-contact-method --region $R --protocol Email --contact-endpoint you@example.com
# then click the link in AWS's email: until it is confirmed, alerts go nowhere

aws lightsail put-alarm --region $R --alarm-name ktrg-cpu-80 --monitored-resource-name ktrg-cms \
  --metric-name CPUUtilization --comparison-operator GreaterThanThreshold --threshold 80 \
  --evaluation-periods 2 --datapoints-to-alarm 2 --contact-protocols Email
aws lightsail put-alarm --region $R --alarm-name ktrg-unreachable --monitored-resource-name ktrg-cms \
  --metric-name StatusCheckFailed --comparison-operator GreaterThanThreshold --threshold 0 \
  --evaluation-periods 2 --datapoints-to-alarm 2 --contact-protocols Email
```

Lightsail has no memory or disk metric: those two still come from the CloudWatch agent installed in step 7, and an
alarm on them has to be made in the CloudWatch console by hand (the agent reports this server by its host name, not
by an EC2 instance id). Worth one more alarm: **transfer**. The bundle includes 3 TB a month and anything over it is
billed per GB, so an alarm on `NetworkOut` tells you when something is downloading the videos in a loop.

### Step 20: CI/CD

The build half gets easier than on EC2; the deploy half gets harder.

- **Build.** `.github/workflows/deploy-aws.yml` builds ARM images, which needed GitHub's ARM machines. For Lightsail
  it builds `linux/amd64` on the standard `ubuntu-latest` runners: no emulation, no special machines, so the "images
  job stays Queued" problem of the EC2 setup disappears. Signing in to AWS stays **OIDC**
  (`bash deploy/aws/cicd-setup.sh`, the role `ktrg-github-deploy`), so no AWS key is stored in GitHub.
- **Deploy.** `ssm send-command` cannot reach a Lightsail instance. Two ways, neither built yet:
  1. **The server pulls (recommended).** The workflow writes the new tag to
     `s3://ktrg-backups-712723095627/deploy/aws/TAG`; a systemd timer on the server checks that file every few
     minutes and runs `./deploy.sh <tag>` when it has changed. Nothing new is opened to the internet, GitHub holds no
     key to the server, and the `ssm:SendCommand` statement can be dropped from `cicd-setup.sh`. It needs a small
     script (`pull-deploy.sh`) and one more timer in `timers-setup.sh`.
  2. **Actions connects by SSH.** A private key in a GitHub secret, and port 22 open to GitHub's address ranges
     (large, and they change). Quicker to write, weaker, and it undoes the narrow port-22 rule of step 4.

Until one of them exists, a deploy is: build (in Actions or on the server), then SSH in and run `./deploy.sh <tag>`.

### Step 21: clean-up and resizing

```bash
R=ap-northeast-1
aws lightsail stop-instance   --region $R --instance-name ktrg-cms    # stop: can come back, still billed
aws lightsail delete-instance --region $R --instance-name ktrg-cms    # gone for good, with its disk
aws lightsail detach-static-ip  --region $R --static-ip-name ktrg-ip  # an IP attached to nothing costs money
aws lightsail release-static-ip --region $R --static-ip-name ktrg-ip
```

**A bundle cannot be changed in place.** To get a bigger one: snapshot, create a new instance from the snapshot with
the larger bundle, move the static IP, delete the old instance.

```bash
aws lightsail create-instance-snapshot --region $R --instance-snapshot-name ktrg-resize --instance-name ktrg-cms
aws lightsail create-instances-from-snapshot --region $R --instance-names ktrg-cms-2 \
  --instance-snapshot-name ktrg-resize --bundle-id <bigger bundle> --availability-zone ${R}a --key-pair-name ktrg
aws lightsail attach-static-ip --region $R --static-ip-name ktrg-ip --instance-name ktrg-cms-2
```

The new instance needs `put-instance-public-ports` again: firewall rules do not travel in a snapshot. The
certificate and the data do, because they live on the disk.

**Retiring the EC2 server** — after the Lightsail site has served for a few days and a backup has been restored once
— starts with its timers, so the two servers stop overwriting each other's backups:

```bash
# old server
systemctl disable --now ktrg-backup ktrg-certbot ktrg-purge
# your PC
aws ec2 stop-instances --instance-ids <old id>          # reversible
aws ec2 terminate-instances --instance-ids <old id>     # gone for good, with its disk
```

Its Elastic IP is released separately, and its role, security group and the ARM image tags in ECR can go after that.

---

## Lessons learned

Everything in the [EC2 guide's list](aws-setup-guide.md#lessons-learned) still applies: Git Bash and Windows paths,
LF line endings, which machine a command is actually running on, pasting one command at a time, pgAdmin's empty
`postgres` database. These are the Lightsail-specific ones.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Could not connect to the endpoint URL` on a Lightsail command | Lightsail is not offered in Osaka | `--region ap-northeast-1` |
| `exec format error` when a container starts | an ARM image on the x86 bundle | rebuild for amd64 (step 11); keep the architecture in the tag |
| The site answered, then nothing at all | `put-instance-public-ports` was sent with one port in it | send all three rules in one command |
| SSH times out from a new place | the port-22 rule still names your old address | run `put-instance-public-ports` again, or use the console's browser SSH |
| `Unable to locate credentials` on the server | step 6 skipped: there is no instance role here | write `/root/.aws/credentials` |
| The daily file backup logs `Unable to locate credentials` | `backup_s3` runs as user 1000 and cannot read root's key | mount `/opt/ktrg/aws` at `/tmp/.aws` (step 6) |
| `exit code 137` during the website build | the Next.js build ran out of memory on 2 GB | check the swap exists (`free -h`), build in Actions, or resize (step 21) |
| An alarm never arrives | the Lightsail contact method was never confirmed by email | Account → Notifications, then the link in the email |
| Two different backups of the same day in S3 | both servers still have their timers on | stop the old server's timers (step 21) |
| The bill is above the bundle price | transfer over the allowance, snapshots, or a static IP attached to nothing | the instance's Metrics tab; release unused IPs |
