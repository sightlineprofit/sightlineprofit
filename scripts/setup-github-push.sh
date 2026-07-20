#!/usr/bin/env bash
set -euo pipefail

KEY="$HOME/.ssh/id_ed25519_sightline"
PUB="${KEY}.pub"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

if [[ ! -f "$KEY" ]]; then
  ssh-keygen -t ed25519 -f "$KEY" -N "" -C "$(whoami)@sightlineprofit"
fi

if ! grep -q "Host github.com" "$HOME/.ssh/config" 2>/dev/null; then
  cat >> "$HOME/.ssh/config" <<EOF

Host github.com
  HostName github.com
  User git
  IdentityFile $KEY
  IdentitiesOnly yes
EOF
  chmod 600 "$HOME/.ssh/config"
fi

cd "$REPO_ROOT"
git remote set-url origin git@github.com:sightlineprofit/sightlineprofit.git

echo ""
echo "Git remote:"
git remote -v
echo ""
echo "Public key (add at https://github.com/settings/ssh/new):"
cat "$PUB"
echo ""

if command -v pbcopy >/dev/null; then
  pbcopy < "$PUB"
  echo "Copied public key to clipboard."
fi

if command -v open >/dev/null; then
  open "https://github.com/settings/ssh/new"
  echo "Opened GitHub SSH key page — paste, save, then run: git push origin main"
else
  echo "After adding the key, run: git push origin main"
fi
