#!/usr/bin/env bash
# На сервере после push:  cd /opt/discord-nash-bot/DiscordNashBot && bash update.sh
# Только git pull --ff-only (без reset --hard). При конфликте — править вручную.
exec bash "$(cd "$(dirname "$0")" && pwd)/deploy/update.sh"
