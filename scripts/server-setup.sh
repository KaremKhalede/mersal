#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu server (Oracle Cloud Free Tier, or any other Ubuntu VM):
# installs Docker, clones this repo, generates the secrets that don't need to come from you, and
# brings up the app + its own database. Safe to re-run — every step checks before it acts.
#
# Usage on the server, right after your first SSH login:
#   curl -fsSL https://raw.githubusercontent.com/KaremKhalede/mersal/main/scripts/server-setup.sh | bash
#
# What THIS script cannot do for you (needs your own account/browser):
#   - Creating the Oracle Cloud / Cloudflare accounts themselves.
#   - Creating a Cloudflare R2 bucket + API token (for file storage — required, see docs/DEPLOYMENT.md).
#   - `cloudflared tunnel login` (opens a browser to your Cloudflare account) — one command, printed
#     at the end of this script, that you run once.
set -euo pipefail

REPO_URL="https://github.com/KaremKhalede/mersal.git"
REPO_DIR="$HOME/mersal"

echo "==> [1/5] Updating the system..."
sudo apt-get update -y -qq
sudo apt-get upgrade -y -qq

echo "==> [2/5] Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "    Docker installed. You may need to log out and back in for group permissions to apply"
  echo "    (this script uses 'sudo docker' below so it works right away either way)."
else
  echo "    Docker already installed, skipping."
fi

echo "==> [3/5] Cloning/updating the app..."
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" pull
else
  git clone "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"

echo "==> [4/5] Preparing environment variables..."
if [ ! -f .env ]; then
  # POSTGRES_PASSWORD and SESSION_SECRET need to be secret and random, not meaningful to you — so
  # this generates them instead of asking you to. APP_URL and the R2/S3 values genuinely cannot be
  # known ahead of time (they depend on your own domain and your own Cloudflare R2 bucket), so
  # those are left as placeholders for you to fill in.
  cat > .env <<ENVEOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SESSION_SECRET=$(openssl rand -hex 32)

# Fill these in before continuing (see docs/DEPLOYMENT.md, "الخيار 2"):
APP_URL=https://CHANGE-ME-your-domain.com
S3_BUCKET=CHANGE-ME
S3_ENDPOINT=https://CHANGE-ME.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=CHANGE-ME
S3_SECRET_ACCESS_KEY=CHANGE-ME
ENVEOF
  echo ""
  echo "    Created .env with a random database password and session secret already filled in."
  echo "    STOP HERE — edit the remaining CHANGE-ME values first:"
  echo ""
  echo "        nano $REPO_DIR/.env"
  echo ""
  echo "    Then run this script again (or just: cd $REPO_DIR && sudo docker compose up -d --build)"
  exit 0
fi

if grep -q "CHANGE-ME" .env; then
  echo ""
  echo "    .env still has CHANGE-ME placeholders left in it. Edit it first:"
  echo ""
  echo "        nano $REPO_DIR/.env"
  echo ""
  exit 1
fi

echo "==> [5/5] Starting the app (database + migrations + web server)..."
sudo docker compose up -d --build

echo ""
echo "==> Checking it actually came up..."
sleep 5
if curl -sf http://localhost:3000/api/health > /dev/null; then
  echo "    ✓ App is running and healthy on this server (port 3000, not yet public)."
else
  echo "    ✗ Health check failed — run 'sudo docker compose logs app' to see why."
  exit 1
fi

echo ""
echo "==> Installing cloudflared (to connect this server to your Cloudflare network)..."
if ! command -v cloudflared &> /dev/null; then
  curl -fsSL -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  sudo dpkg -i /tmp/cloudflared.deb
fi

cat <<'EOF'

════════════════════════════════════════════════════════════════════
كل شي جاهز على السيرفر. باقي 4 أوامر فقط، تسويها مرة وحدة (كل واحد
يفتح لك رابط/يسألك سؤال — هذي الخطوة الوحيدة اللي لازم تكون تفاعلية):

    cloudflared tunnel login
    cloudflared tunnel create chargee
    cloudflared tunnel route dns chargee YOUR-DOMAIN-HERE
    sudo cloudflared service install
    sudo systemctl start cloudflared

بعدها موقعك يشتغل على النطاق اللي حطيته، عبر شبكة كلاودفير بالكامل.
التفاصيل والشرح الكامل في docs/DEPLOYMENT.md — قسم "الخيار 2".
════════════════════════════════════════════════════════════════════
EOF
