#!/bin/bash
# Host setup of the ktrg-lightsail server (設計書 7. ホストの設定, forked for Lightsail): Amazon Linux 2023.
# Run ON THE SERVER as root (SSH in, then `sudo -i`):
#
#   bash server-setup.sh
#
# Safe to run again: each part checks first.
#   a. update packages   b. 2 GB swap   c. Docker (with log rotation)   d. Docker Compose   e. CloudWatch agent   f. check
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root: sudo -i first"; exit 1; }

echo "== a. update packages"
dnf update -y -q

echo "== b. 2 GB swap"
# Disk space used as extra memory when the 2 GB of RAM is nearly full: slower, but nothing gets killed.
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=128M count=16   # 128 MB x 16 = 2 GB
  chmod 600 /swapfile                             # root only
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' >> /etc/fstab   # on again after a reboot
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/90-swappiness.conf  # use swap only when memory is nearly full
# Load only this file: `sysctl --system` also loads Amazon Linux's defaults, some of which this kernel rejects.
sysctl -q -p /etc/sysctl.d/90-swappiness.conf

echo "== c. Docker"
dnf install -y -q docker
mkdir -p /etc/docker
# Log rotation: each container keeps at most 5 log files of 20 MB, so logs cannot fill the disk.
cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
JSON
systemctl enable docker
systemctl restart docker
# Run docker without sudo (from the next login). ssm-user exists after the first Session Manager login.
for user in ssm-user ec2-user; do
  id "$user" >/dev/null 2>&1 && usermod -aG docker "$user"
done

echo "== d. Docker Compose"
# Not packaged for Amazon Linux 2023: the plugin from GitHub. $(uname -m) is aarch64 on t4g, x86_64 on t3.
if ! docker compose version >/dev/null 2>&1; then
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

echo "== e. CloudWatch agent"
# CPU, memory and disk use are all invisible to AWS from outside on Lightsail (unlike EC2, which reports CPU itself).
# The agent sends all three every minute to CloudWatch (namespace "ktrg-lightsail"), for the 80% alarms
# (alarms-setup.sh). Permission: anupap's ktrg-lightsail-server policy addition (cloudwatch:PutMetricData).
# No "${aws:InstanceId}" dimension: that pseudo-var only resolves via EC2's instance metadata service, which
# Lightsail doesn't expose -- -m onPremise tells the agent not to look for it, and to use the access key in
# ~/.aws/credentials instead. This namespace is only ever written to by this one server, so no dimension is needed
# to tell its metrics apart from anyone else's.
dnf install -y -q amazon-cloudwatch-agent
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'JSON'
{
  "agent": { "metrics_collection_interval": 60 },
  "metrics": {
    "namespace": "ktrg-lightsail",
    "metrics_collected": {
      "cpu":  { "measurement": ["cpu_usage_active"], "totalcpu": true },
      "mem":  { "measurement": ["mem_used_percent"] },
      "disk": { "measurement": ["used_percent"], "resources": ["/"], "drop_device": true }
    }
  }
}
JSON
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m onPremise -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json >/dev/null
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status | grep '"status"'

echo "== f. check"
free -h
docker --version
docker compose version
docker run --rm hello-world | grep -m1 "Hello from Docker"
echo "server-setup: done"
