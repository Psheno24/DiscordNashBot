/**
 * Общий HTML для Telegram-экранов (магазин и работа).
 * Без зависимости от Discord-панели — чтобы TG/shop не тянули весь panel.ts.
 */

function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function economyMarkdownToTelegramHtml(text: string): string {
  let s = escapeTelegramHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  s = s.replace(/&lt;t:(\d+):[a-zA-Z]+&gt;/g, (_, sec) => {
    const d = new Date(Number(sec) * 1000);
    return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  });
  return s;
}

/** Заголовок HTML + тело из Discord-markdown. */
export function economyTelegramScreen(title: string, markdownBody: string): string {
  const body = markdownBody.trim();
  if (!body) return `<b>${escapeTelegramHtml(title)}</b>`;
  return `<b>${escapeTelegramHtml(title)}</b>\n\n${economyMarkdownToTelegramHtml(body)}`;
}
