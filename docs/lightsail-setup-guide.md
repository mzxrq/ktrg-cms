# Lightsail setup guide: step by step

How ktrg-cms was deployed a second time, on an already-existing Lightsail instance, as its own independent
environment alongside the EC2 deployment (`docs/aws-setup-guide.md`). Day-to-day operation is in
[deploy/lightsail/README.md](../deploy/lightsail/README.md); this guide is for learning how the pieces fit, or for
doing it again (e.g. on a fresh Lightsail instance).

```
visitor ─https─> nginx ─/api/*───> api:3001 ──> db:5432 (PostgreSQL 18, official image)
                       ├─/files/*─> storage_data volume (photos, videos)
                       └─other────> web:3000 (Next.js) ──> api:3001
```

| Part | Steps |
| --- | --- |
| A. Why this differs from EC2 | no instance role · no Session Manager · wrong CPU architecture |
| B. AWS side | 1 S3 bucket · 2 IAM permissions · 3 settings · 4 firewall |
| C. Fork the deploy scripts | 5 what changed and why |
| D. The server | 6 reaching it · 7 host bootstrap · 8 images without ECR |
| E. The data | 9 Supabase → S3 → server · 10 files from R2 |
| F. Running it | 11 timers · 12 CloudWatch alarms (unresolved) |
| | [Lessons learned](#lessons-learned) |

---

## A. Why this differs from EC2

Lightsail is not EC2 wearing a different console. Three real differences drove every change in
`deploy/lightsail/` relative to `deploy/aws/`:

1. **No IAM instance role the way EC2 has one.** EC2's role hands out short-lived credentials for free via the
   metadata service; nothing like that is attachable to a Lightsail instance for general AWS API access. Every
   script that calls `aws s3`/`aws ssm` needs an actual IAM user's access key sitting in `~/.aws/credentials`
   instead.
2. **No Session Manager.** EC2's security group closes port 22 entirely and relies on SSM; Lightsail access here
   is plain SSH (the instance's own default key, or the console's browser SSH button). A side effect: the
   CloudWatch agent's `-m ec2` mode (which resolves `${aws:InstanceId}` via the metadata service) doesn't apply
   either — `-m onPremise` is the one that fits, though as step 12 found, this agent has its own problems
   independent of that choice.
3. **Wrong CPU architecture.** The EC2 images in ECR were built once, deliberately, on the ARM64 (Graviton)
   EC2 box. This Lightsail instance turned out to be **amd64** (discovered via `amazon-cloudwatch-agent-...x86_64`
   in a package-install log, not by asking upfront) — pulling those same ECR images here fails outright
   ("no matching manifest for linux/amd64"). Rather than pushing a second, amd64-tagged set of images to ECR
   (which needs push rights this account's IAM policy doesn't grant to anyone but root), `web`/`api` are built
   **locally from source** on every deploy instead; `db` uses the official multi-arch `postgres:18-alpine`
   directly from Docker Hub, sidestepping ECR for the database image entirely.

**If you're repeating this on a fresh Lightsail instance:** check its architecture *before* assuming ECR images
will work (`uname -m`), and know in advance whether you have (or can get) a login with real IAM permissions —
section B below hits a wall almost immediately without one.

---

## B. AWS side

### Step 1: a dedicated S3 bucket

Not a folder inside EC2's bucket — a separate bucket, so this environment's backups can never collide with or
threaten EC2's, and the whole thing is deletable in one step if abandoned.

```bash
export AWS_PROFILE=ktrg-cms AWS_REGION=ap-northeast-1 MSYS_NO_PATHCONV=1
ACCOUNT=712723095627
BUCKET=dev-ktrg-lightsail-backups-$ACCOUNT

aws s3api create-bucket --bucket $BUCKET --create-bucket-configuration LocationConstraint=$AWS_REGION
aws s3api put-public-access-block --bucket $BUCKET --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
echo '{ "Rules": [ { "ID": "expire-db-dumps", "Filter": { "Prefix": "db/" }, "Status": "Enabled",
  "Expiration": { "Days": 90 } } ] }' > s3-life.json
aws s3api put-bucket-lifecycle-configuration --bucket $BUCKET --lifecycle-configuration file://s3-life.json
rm s3-life.json
```

**The bucket name is not arbitrary.** The account's working IAM identity (see step 2) can only create/manage
buckets named `dev-*` or `backend-*` — that constraint decided the name, not a convention chosen up front.

### Step 2: IAM permissions — the actual shape of this account

There is no `ktrg-admin`-style full-admin user here (that was an assumption carried over from the EC2 guide's
wording). The CLI profiles (`ktrg`, `ktrg-cms` — both the same underlying credentials, just two names) resolve to
IAM user **`anupap`**, bound to a customer-managed policy called **`Backend_Developer`**. Two things about that
policy matter a great deal for everything that follows:

- It allows `lightsail:*` outright (regions `ap-northeast-1`/`ap-northeast-3`) — the firewall step needed nothing
  extra.
- It carries an **explicit `Deny`** on `iam:*` (plus `organizations:*`, `billing:*`, and a few specific
  destructive EC2/logs actions). An explicit Deny always overrides any Allow, including one added later to the
  same policy — so `anupap` can **never** grant itself more IAM permissions, attach a policy to itself, or create
  its own access key, no matter how that policy's other statements are edited. Every one of those actions needs a
  *different* identity: the account's actual root login, used directly (not through `anupap`).

What `anupap` needed that it didn't have, and how each was granted (all of the following required root, run once
in CloudShell — not reusable by `anupap` itself):

```bash
# a second access key for anupap, to live on the server only (not the same one as your PC's CLI)
aws iam create-access-key --user-name anupap

# ECR read -- turned out unused once the amd64/ARM64 mismatch (section A.3) ruled ECR out for this environment,
# but harmless to leave attached
aws iam attach-user-policy --user-name anupap --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly

# extend Backend_Developer itself, as new policy versions -- never overwriting what was already allowed:
#   VisualEditor5's Action list +: s3:PutBucketPublicAccessBlock, s3:PutLifecycleConfiguration (finish the bucket)
#   + ssm:GetParameter/PutParameter on arn:aws:ssm:ap-northeast-1:712723095627:parameter/ktrg/lightsail/*
#   + cloudwatch:PutMetricData (Resource *)
#   + cloudwatch:PutMetricAlarm, scoped to arn:aws:cloudwatch:*:712723095627:alarm:ktrg-lightsail-*
```

(The exact `jq`-based create-policy-version commands are in the chat history of the session that did this; the
pattern is: fetch the current default version, append a new `Statement` entry with a fresh `Sid`, `create-policy-version
--set-as-default`. IAM keeps at most 5 versions — delete the oldest non-default one first if that limit is hit.)

### Step 3: settings in Parameter Store

A separate parameter path (`/ktrg/lightsail/env`, not `/ktrg/env`) so this environment's settings can never be
overwritten by, or overwrite, EC2's. `deploy/lightsail/.env.production` (gitignored) differs from EC2's
`.env.production` in:

| Setting | Why it differs |
| --- | --- |
| `S3_BUCKET_NAME` | `dev-ktrg-lightsail-backups-712723095627` (step 1) |
| `DOMAIN` | `52-199-244-32.sslip.io` — a free hostname that resolves straight to the static IP, no DNS needed |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | **New, EC2 has no equivalent.** The `backup_s3` container's comment used to say "uses the server's IAM role: no AWS keys here" — false on Lightsail. Without these two lines, `docker compose` itself refuses to start (`required variable ... is missing a value`) |
| `SUPABASE_DATABASE_URL` and other data-source settings | left the same as EC2's — this environment reads the same production Supabase project (read-only), just keeps its own separate Postgres copy |

```bash
aws ssm put-parameter --name /ktrg/lightsail/env --type SecureString --value file://deploy/lightsail/.env.production
```

### Step 4: firewall

Console → instance → **Networking** tab → add **HTTP (80)** and **HTTPS (443)**, or via `anupap`'s
already-granted `lightsail:*`:

```bash
aws lightsail put-instance-public-ports --instance-name <name> --port-infos \
  fromPort=22,toPort=22,protocol=tcp,cidrs=0.0.0.0/0,ipv6Cidrs=::/0 \
  fromPort=80,toPort=80,protocol=tcp,cidrs=0.0.0.0/0,ipv6Cidrs=::/0 \
  fromPort=443,toPort=443,protocol=tcp,cidrs=0.0.0.0/0,ipv6Cidrs=::/0
```

(This call replaces the *entire* rule set in one go — include everything that should stay open, SSH included, or
you'll lock yourself out of that too.)

---

## C. Fork the deploy scripts

`deploy/aws/` was copied to `deploy/lightsail/` rather than parameterizing the EC2 scripts, because several
values (the S3 bucket, the SSM path) are hardcoded constants near the top of individual scripts, not read from
`.env`. Forking keeps EC2's files completely untouched. What actually changed, file by file:

| File | Change | Why |
| --- | --- | --- |
| `backup-db.sh`, `restore-from-s3.sh`, `supabase-to-s3.sh` | `BUCKET=dev-ktrg-lightsail-backups-712723095627`; `/opt/ktrg` → `/opt/ktrg-lightsail` | own bucket, own install path |
| `move-files.sh`, `restore-from-s3.sh` | `ktrg_storage_data` → `ktrg-lightsail_storage_data` | the Docker volume's implicit name follows the Compose *project* name, which defaults to the directory basename (`/opt/ktrg-lightsail`, not `/opt/ktrg`) |
| `deploy.sh` | one `$REGION` split into `$SSM_REGION` (`ap-northeast-1`) — the ECR login step was removed entirely (see step 8) | the settings parameter and (originally) the ECR repos live in *different* regions; conflating them into one variable was a latent bug this fork exposed, now moot since ECR isn't used at all here |
| `docker-compose.yml` | `backup_s3`'s region → `ap-northeast-1`; added `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` env vars; `db`'s image → plain `postgres:18-alpine`; `api`/`web` gained `build:` sections pointing at `./src` | no instance role (needs explicit keys); no ECR (architecture mismatch, section A.3) |
| `server-setup.sh` | CloudWatch agent: namespace `ktrg` → `ktrg-lightsail`; dropped `append_dimensions: {InstanceId: "${aws:InstanceId}"}`; added a `cpu` metric; `-m ec2` → `-m onPremise` | `${aws:InstanceId}` only resolves via EC2's metadata service; Lightsail doesn't report CPU externally the way EC2 does, so the agent has to collect it |
| `timers-setup.sh`, `purge-deletions.sh`, `renew-cert.sh` | timer names `ktrg-*` → `ktrg-lightsail-*`; paths updated | cosmetic/consistency — these run on a separate host so there was never an actual naming collision, just clearer logs |
| `aws-setup.sh`, `cicd-setup.sh`, `alarms-setup.sh` | **not copied.** Their jobs are covered by section B (IAM/firewall are one-time, done by hand) and section F (alarms, manually, see step 12) | these three scripts assume EC2/Session-Manager-specific APIs (`ec2 describe-instances`, `ssm send-command`) that have no Lightsail equivalent |

---

## D. The server

### Step 6: reaching the server

The Lightsail default key pair is what the instance actually trusts — **not** whatever `.pem` file happens to be
lying around locally (a `ktrg-prod.pem` from an unrelated project was tried first and rejected; the instance's
`~/.ssh/authorized_keys` named `LightsailDefaultKeyPair`, which settled it). Simplest path when in doubt: the
Lightsail console's **Connect using SSH** button opens a browser terminal, already authenticated, no key
management at all.

```bash
sudo -i   # become root, same as the EC2 guide
```

### Step 7: host bootstrap

Files arrive the same way as EC2 — through S3, since the server has no git/GitHub access of its own:

```bash
# your PC
aws s3 sync deploy/lightsail s3://dev-ktrg-lightsail-backups-712723095627/deploy/lightsail/ --exclude ".env*"
# server
mkdir -p /opt/ktrg-lightsail && cd /opt/ktrg-lightsail
aws s3 sync s3://dev-ktrg-lightsail-backups-712723095627/deploy/lightsail/ /opt/ktrg-lightsail/
chmod +x *.sh nginx/*.sh
```

Before any of the server's own scripts can call `aws` at all, it needs the access key from step 2:

```bash
mkdir -p ~/.aws
cat > ~/.aws/credentials <<'EOF'
[default]
aws_access_key_id = <anupap's server key id>
aws_secret_access_key = <anupap's server key secret>
EOF
cat > ~/.aws/config <<'EOF'
[default]
region = ap-northeast-1
EOF
chmod 600 ~/.aws/credentials ~/.aws/config
aws sts get-caller-identity   # confirms user/anupap
```

Then the bootstrap itself:

```bash
bash server-setup.sh
```

One extra package beyond EC2's list: `docker compose build` needs **buildx ≥ 0.17.0**, which the Amazon Linux
Docker package doesn't bundle at a current-enough version. Same GitHub-release pattern as the Compose plugin
itself:

```bash
VER=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/docker/buildx/releases/latest | sed 's#.*/tag/##')
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/buildx/releases/download/$VER/buildx-$VER.linux-amd64" -o /usr/local/lib/docker/cli-plugins/docker-buildx
chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx
```

### Step 8: images, without ECR

```bash
# your PC: package the committed source (same idea as EC2 step 11, minus the ECR push)
git archive --format=tar.gz -o ktrg-src.tar.gz HEAD
aws s3 cp ktrg-src.tar.gz s3://dev-ktrg-lightsail-backups-712723095627/deploy/ktrg-src.tar.gz
rm ktrg-src.tar.gz
```

```bash
# server
rm -rf src && mkdir src
aws s3 cp s3://dev-ktrg-lightsail-backups-712723095627/deploy/ktrg-src.tar.gz - | tar -xz -C src
mkdir -p certbot/conf certbot/www
./deploy.sh
```

`deploy.sh` now builds `web`/`api` from `./src` (`docker compose build --pull api web`) and pulls everything else
(`db`, `nginx`, `certbot`, `pgadmin`, `backup_s3`) straight from Docker Hub — no login, no registry, no ARM/amd64
question to get wrong. It then gets the HTTPS certificate and checks `/api/v1/health` through nginx, same as EC2.

---

## E. The data

Both steps read from the real production sources (Supabase, Cloudflare R2) **read-only** and write only into this
server's own, separate database/disk — nothing here is capable of affecting EC2's copy.

### Step 9: database from Supabase

```bash
./supabase-to-s3.sh                                     # prints Supabase's rows per table
./restore-from-s3.sh ktrg-<time>-supabase.sql.gz        # name it: the newest dump is not always this one
./count-rows.sh                                         # must match, table by table
```

### Step 10: files from Cloudflare R2

```bash
./move-files.sh https://52-199-244-32.sslip.io/files
docker restart s3_backup_cron           # back up the newly-copied files now instead of in 24h
```

Finds every R2 address still referenced in the content just restored, downloads each file into this server's own
`storage_data` volume, and rewrites the database rows to point at `https://52-199-244-32.sslip.io/files/…`. R2
itself is only ever read.

---

## F. Running it

### Step 11: scheduled jobs

```bash
bash timers-setup.sh
systemctl start ktrg-lightsail-backup && journalctl -u ktrg-lightsail-backup -n 5 --no-pager
```

Same three jobs as EC2 (backup, cert renewal, account purge), named `ktrg-lightsail-*` instead of `ktrg-*`.

### Step 12: CloudWatch alarms — unresolved

**This part did not get finished.** The intent (mirroring EC2's `alarms-setup.sh`, but reusing the agent-published
custom namespace `ktrg-lightsail` instead of `AWS/EC2`, since Lightsail reports neither CPU nor memory/disk the
way EC2 does) ran into a wall that stayed unsolved by the end of the session:

1. The CloudWatch agent is **not** running as root, regardless of the systemd unit having no `User=` line — AWS's
   agent package self-drops privileges to a dedicated `cwagent` user internally, by design.
2. `cwagent` cannot read `/root/.aws/credentials` at all, **even after `chmod 644`** — `/root` itself is
   `dr-xr-x---` (no access for "other"), so the block is directory traversal, not the file's own mode.
3. The documented fix (AWS's `common-config.toml`, `[credentials]` section, pointing at a copy of the credentials
   file somewhere `cwagent` *can* reach) was configured correctly and matched AWS's own docs, but the resulting
   compiled `amazon-cloudwatch-agent.toml` never picked up a `[credentials]` section at all — the agent kept
   trying `/root/.aws/credentials` regardless. Why the translator ignored `common-config.toml` wasn't root-caused
   before the session ended.

The service is currently **stopped and disabled** (`systemctl disable amazon-cloudwatch-agent`) rather than left
crash-looping on a 60-second `RestartSec`. Metrics/alarms are simply absent right now — this doesn't affect the
app, the data, or the backups in any way, since none of those depend on the agent.

**To pick this up later**, the next thing to try is probably: run the agent manually in the foreground as
`cwagent` (`sudo -u cwagent /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent -config ... -printMode`
or similar) to see config-resolution logging directly, rather than going through `amazon-cloudwatch-agent-ctl`
and reading the log file after the fact.

---

## Lessons learned

| Symptom | Cause | Fix |
| --- | --- | --- |
| `InvalidClientTokenId` on a profile that worked minutes earlier | a leftover `AWS_PROFILE=ktrg-cms` env var, set in one terminal, got carried into commands meant for a different terminal (PC vs. server) | always confirm which terminal a command is meant for; `env \| grep -i aws` to check for stale overrides |
| `aws: [ERROR]: The config profile (ktrg-cms) could not be found` on the server | the server's `~/.aws/credentials` only ever has `[default]` — there is no `ktrg`/`ktrg-cms` profile there, only on your PC | never `export AWS_PROFILE=...` on the server; just run `aws ...` plain there |
| `ssh: Permission denied (publickey...)` | the `.pem` file being used didn't match the instance's actual trusted key | check `~/.ssh/authorized_keys` on the instance (via browser SSH) for the real key's comment/name, or just use "Connect using SSH" in the console |
| `AccessDenied` on any `iam:*` call, from any policy edit attempt | signed into CloudShell as `anupap`, not root — `anupap`'s own policy explicitly denies `iam:*`, which always overrides any Allow, including on itself | sign out and back in as the account's root user before opening CloudShell for an IAM edit |
| `s3:CreateBucket` denied despite `anupap` otherwise working | the policy only allows bucket names starting with `dev-` or `backend-` | name the bucket to fit, rather than requesting a policy change |
| ECR image pull fails ("no matching manifest") | the EC2 images are ARM64-only; this instance is amd64 | build `web`/`api` locally from source instead of reusing EC2's ECR images; use the official multi-arch `postgres:18-alpine` for `db` |
| `docker compose build` → "requires buildx 0.17.0 or later" | Amazon Linux's bundled Docker package ships an old buildx plugin | install a current `docker-buildx` into `/usr/local/lib/docker/cli-plugins/`, same pattern as the Compose plugin |
| `docker compose` refuses to start: `required variable AWS_ACCESS_KEY_ID is missing a value` | the `backup_s3` container has no instance role to fall back on, unlike EC2 | add `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` to `.env.production`, referenced in `docker-compose.yml`'s `backup_s3` service |
| CloudWatch agent: `AccessDenied ... assumed-role/AmazonLightsailInstanceRole` | Lightsail instances *do* have a default, very limited instance role, reachable via the metadata service, that the agent found before it found `~/.aws/credentials` | point the agent at an explicit credentials file via `common-config.toml` (attempted; see step 12 — this part still isn't fully resolved) |
| CloudWatch agent: `open /root/.aws/credentials: permission denied`, even as root, even after `chmod 644` | the agent runs as `cwagent`, not root (self-dropped privilege, not a systemd setting); `/root` itself blocks traversal for "other" | give the agent its own copy of the credentials file under a path `cwagent` can actually reach — this got the permission error further along but not fully fixed (step 12) |
