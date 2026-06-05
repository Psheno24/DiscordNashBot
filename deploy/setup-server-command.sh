#!/usr/bin/env bash
# Один раз на VPS (после clone в /opt/discord-nash-bot/DiscordNashBot):
#   bash deploy/setup-server-command.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

chmod +x update.sh deploy/update.sh deploy/setup-server-command.sh 2>/dev/null || true

MARK="# DiscordNashBot deploy"
LINE="alias nashbot-update='cd ${ROOT} && bash update.sh'"

if ! grep -qF "$MARK" ~/.bashrc 2>/dev/null; then
	{
		echo ""
		echo "$MARK"
		echo "$LINE"
	} >> ~/.bashrc
	echo "Добавлено в ~/.bashrc: nashbot-update"
else
	echo "Алиас уже есть в ~/.bashrc"
fi

echo ""
echo "Готово. После push на сервере:  nashbot-update"
echo "(git pull + npm ci + npm run build + restart, в конце [OK] или [FAIL])"
