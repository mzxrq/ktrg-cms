# Running on Lightsail (amd64, built from source)

A second, independent deployment of ktrg-cms, alongside the EC2 one (`deploy/aws/`). Own database, own uploaded
files, own domain — nothing here is shared with EC2 except the AWS account and (read-only) Supabase/R2 as the
original data sources. Full write-up of how this was built: [docs/lightsail-setup-guide.md](../../docs/lightsail-setup-guide.md).

```
visitor ─https─> nginx ─/api/*───> api:3001 (ktrg-api) ──> db:5432 (ktrg-db, PostgreSQL 18, official image)
                       ├─/files/*─> storage_data volume (uploaded photos and videos)
                       └─other────> web:3000 (ktrg-web) ──> api:3001
```

| Thing | Value |
| --- | --- |
| Server | Lightsail instance, amd64, Amazon Linux 2023, `ap-northeast-1` (Tokyo); files in `/opt/ktrg-lightsail` |
| Address | Static IP `52.199.244.32`, site `https://52-199-244-32.sslip.io` |
| Access | SSH (Lightsail's own default key, or the browser "Connect using SSH" button) — no Session Manager |
| AWS auth | IAM user `anupap`'s own access key, in `~/.aws/credentials` on the server (Lightsail has no instance role) |
| Images | **No ECR.** This host is amd64; EC2's ECR images are ARM64-only. `web`/`api` build from `./src` on every deploy; `db` is the official multi-arch `postgres:18-alpine` straight from Docker Hub |
| Settings | SSM Parameter Store `/ktrg/lightsail/env` (SecureString), written to `/opt/ktrg-lightsail/.env` by `deploy.sh` |
| Backups | `s3://dev-ktrg-lightsail-backups-712723095627/db/` (daily 03:00 JST, 90 days) and `/backups/images/` (daily, never deleted) |
| HTTPS | Let's Encrypt via Certbot, renewed by a timer |
| Alarms | **Not set up** — the CloudWatch agent can't authenticate as its `cwagent` user yet; see the guide's Lessons Learned |

Containers: `nginx-gateway`, `ktrg-web`, `ktrg-api`, `ktrg-migrate` (runs the migrations at each start, then stops),
`ktrg-db`, `ktrg-pgadmin`, `s3_backup_cron`. Only nginx is reachable from the internet; pgAdmin listens on the
server's 127.0.0.1 only.

## Files here

| File | Where it runs | What it does |
| --- | --- | --- |
| `server-setup.sh` | server | Swap, Docker, Compose, buildx, CloudWatch agent (onPremise mode) |
| `timers-setup.sh` | server | The scheduled jobs (below) — timer names prefixed `ktrg-lightsail-` |
| `docker-compose.yml`, `nginx/` | server | The services and the nginx config; `web`/`api` build from `./src` |
| `deploy.sh [label]` | server | Settings → build images from `./src` → start → certificate → health check |
| `backup-db.sh` | server | Database dump to S3 |
| `restore-from-s3.sh [--with-files] [dump]` | server | Database back from S3 (and the files, with `--with-files`) |
| `supabase-to-s3.sh` | server | Live database from Supabase to S3 (Supabase is only read) |
| `move-files.sh <base> [old base...]` | server | Files from R2 to the server, addresses rewritten |
| `count-rows.sh [supabase]` | server | Rows per table, to compare copies |
| `renew-cert.sh`, `purge-deletions.sh` | server | Run by the timers |

**Your PC** means Git Bash in the project folder, with `AWS_PROFILE=ktrg-cms AWS_REGION=ap-northeast-1
MSYS_NO_PATHCONV=1` set. **Server** means an SSH session (or the Lightsail console's "Connect using SSH"
button), then `sudo -i; cd /opt/ktrg-lightsail`.

## Deploying a new version

There is no CI/CD for this environment (see the guide) — always by hand:

```bash
# your PC: package the committed code and the latest deploy/lightsail files
git archive --format=tar.gz -o ktrg-src.tar.gz HEAD
aws s3 cp ktrg-src.tar.gz s3://dev-ktrg-lightsail-backups-712723095627/deploy/ktrg-src.tar.gz && rm ktrg-src.tar.gz
aws s3 sync deploy/lightsail s3://dev-ktrg-lightsail-backups-712723095627/deploy/lightsail/ --exclude ".env*"

# server
aws s3 sync s3://dev-ktrg-lightsail-backups-712723095627/deploy/lightsail/ /opt/ktrg-lightsail/ && chmod +x *.sh nginx/*.sh
rm -rf src && mkdir src
aws s3 cp s3://dev-ktrg-lightsail-backups-712723095627/deploy/ktrg-src.tar.gz - | tar -xz -C src
./deploy.sh
```

`./deploy.sh` with no argument just labels the build with the current timestamp (there's no registry tag to roll
back to on this host — a "rollback" here means re-running `git archive` on an older commit).

## Changing a setting

Edit `deploy/lightsail/.env.production` (ignored by git; save it with LF line endings — it needs, beyond the usual
app settings, `S3_BUCKET_NAME=dev-ktrg-lightsail-backups-712723095627`, `DOMAIN=52-199-244-32.sslip.io`, and
`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` for the `backup_s3` container — see the guide), then:

```bash
aws ssm put-parameter --name /ktrg/lightsail/env --type SecureString --overwrite --value file://deploy/lightsail/.env.production
# server
./deploy.sh
```

## Scheduled jobs

`systemctl list-timers 'ktrg-lightsail-*'` (times in UTC). Logs: `journalctl -u ktrg-lightsail-backup`. Run one
now: `systemctl start ktrg-lightsail-backup`.

| Timer | When | Runs |
| --- | --- | --- |
| `ktrg-lightsail-backup` | daily 03:00 JST | `backup-db.sh` |
| `ktrg-lightsail-certbot` | 00:00 and 12:00 | `renew-cert.sh` (renews 30 days before expiry) |
| `ktrg-lightsail-purge` | hourly | `purge-deletions.sh` (accounts whose deletion is due) |

The uploaded files are copied to S3 by the `s3_backup_cron` container once a day (`docker logs s3_backup_cron`).

## Backups and restore

```bash
aws s3 ls s3://dev-ktrg-lightsail-backups-712723095627/db/
./backup-db.sh                                   # a dump now
./restore-from-s3.sh                             # the newest dump
./restore-from-s3.sh ktrg-<time>.sql.gz          # a chosen one
./restore-from-s3.sh --with-files <dump>         # also the files: only for a lost disk
```

## Pulling in fresh data from Supabase / R2

```bash
./supabase-to-s3.sh                                         # prints Supabase's row counts (read-only)
./restore-from-s3.sh ktrg-<time>-supabase.sql.gz
./count-rows.sh                                             # must match
./move-files.sh https://52-199-244-32.sslip.io/files
docker restart s3_backup_cron
```

## pgAdmin

No Session Manager here — tunnel over SSH instead:

```bash
ssh -i <your-lightsail-key> -L 5050:localhost:5050 ec2-user@52.199.244.32
```

Then browse http://localhost:5050. Log in with `PGADMIN_EMAIL`/`PGADMIN_PASSWORD`; register the database with
host `db`, port 5432, and the `POSTGRES_*` settings.
