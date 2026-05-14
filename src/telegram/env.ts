/**
 * VPS (пример): `cd /opt/discord-nash-bot/DiscordNashBot` → отредактировать `.env` в корне проекта
 * (там же, где `DISCORD_TOKEN`), добавить строку:
 *   TELEGRAM_BOT_TOKEN=123456:ABC...
 * Перезапуск процесса бота (pm2/systemd/docker — как у вас настроено).
 *
 * `TELEGRAM_ALLOWED_USER_IDS` — необязательно: если пусто, бот доступен всем в Telegram
 * (привязка только по коду из Discord). Если задано — только перечисленные user id.
 */
function opt(name: string): string | undefined {
  const v = process.env[name];
  if (v == null || v.trim() === "") return undefined;
  return v.trim();
}

/** Токен @BotFather; без него Telegram-часть не стартует. */
export function telegramBotToken(): string | undefined {
  return opt("TELEGRAM_BOT_TOKEN");
}

/** Необязательно: если непусто — только эти Telegram user id. */
export function telegramAllowedUserIds(): Set<string> {
  const raw = opt("TELEGRAM_ALLOWED_USER_IDS");
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isTelegramBridgeConfigured(): boolean {
  return Boolean(telegramBotToken());
}
