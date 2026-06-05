#!/usr/bin/env bash
# На сервере:  nashbot-update   или   bash update.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG="${ROOT}/data/deploy-last.log"
mkdir -p "${ROOT}/data"

fail() {
	local msg="$1"
	echo ""
	echo "[FAIL] $msg"
	if [ -f "$LOG" ]; then
		local hint
		hint="$(grep -iE 'error TS|error:|failed|ERR!|npm ERR' "$LOG" | tail -n 3 | sed 's/^[[:space:]]*//' || true)"
		if [ -n "$hint" ]; then
			echo "Причина:"
			echo "$hint" | sed 's/^/  /'
		fi
		echo "Подробности: data/deploy-last.log"
	fi
	exit 1
}

wait_service_active() {
	local i
	for i in $(seq 1 20); do
		if systemctl is-active --quiet discord-nash-bot 2>/dev/null; then
			return 0
		fi
		sleep 2
	done
	return 1
}

echo "DiscordNashBot: git pull..."
git fetch origin main >/dev/null 2>&1 || fail "нет связи с GitHub"
git pull --ff-only origin main >/dev/null 2>&1 || git reset --hard origin/main >/dev/null 2>&1 || fail "не удалось обновить код"

echo "DiscordNashBot: npm ci (лог: data/deploy-last.log)..."
: >"$LOG"
if ! npm ci >>"$LOG" 2>&1; then
	echo "DiscordNashBot: npm ci не прошёл, пробую npm install..."
	if ! npm install >>"$LOG" 2>&1; then
		fail "не удалось установить зависимости"
	fi
fi

echo "DiscordNashBot: npm run build..."
if ! npm run build >>"$LOG" 2>&1; then
	fail "сборка упала (npm run build на ПК)"
fi

echo "DiscordNashBot: перезапуск systemd..."
if command -v systemctl >/dev/null 2>&1; then
	if systemctl list-unit-files discord-nash-bot.service >/dev/null 2>&1; then
		systemctl restart discord-nash-bot || fail "systemctl restart discord-nash-bot"
		if ! wait_service_active; then
			fail "discord-nash-bot не поднялся — см. journalctl -u discord-nash-bot -n 40"
		fi
	else
		echo "Предупреждение: unit discord-nash-bot.service не найден — перезапустите процесс вручную."
	fi
else
	echo "Предупреждение: systemctl недоступен — перезапустите процесс вручную."
fi

echo ""
echo "[OK] DiscordNashBot обновлён."
