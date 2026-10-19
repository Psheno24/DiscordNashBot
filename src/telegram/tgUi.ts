/** Общие хелперы Telegram-панели: кнопки, время, HTML. */

export type InlineBtn = { text: string; callback_data: string };
export type InlineKb = { inline_keyboard: InlineBtn[][] };
export type ScreenPayload = { text: string; markup?: InlineKb };

/** Практичный лимит текста на кнопке в одну строку (полная ширина). */
export const TG_BTN_FULL = 28;
/** Безопасный лимит на кнопку при 2 в ряду. */
export const TG_BTN_PAIR = 14;

export function row(...buttons: InlineBtn[]): InlineBtn[] {
  return buttons;
}

export function kb(...rows: InlineBtn[][]): InlineKb {
  return { inline_keyboard: rows };
}

export function btnLabel(text: string, max = TG_BTN_FULL): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

/** Компактное время для подписей кнопок (всегда целиком на одной кнопке). */
export function fmtMsCompact(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  if (m >= 1440) {
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    return h > 0 ? `${d}д ${h}ч` : `${d}д`;
  }
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm > 0 ? `${h}ч ${mm}м` : `${h}ч`;
  }
  return `${m}м`;
}

/** Читаемое время для текста сообщения. */
export function fmtMs(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  if (m >= 1440) return `${Math.floor(m / 1440)} д ${Math.floor((m % 1440) / 60)} ч`;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm > 0 ? `${h} ч ${mm} мин` : `${h} ч`;
  }
  return `${m} мин`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Нижний нав: назад + меню — короткие подписи, всегда 2 в ряду. */
export function navRow(backData: string, backLabel = "← Назад"): InlineBtn[] {
  return row(
    { text: btnLabel(backLabel, TG_BTN_PAIR), callback_data: backData },
    { text: "Меню", callback_data: "m" },
  );
}

export function withNote(body: string, note?: string): string {
  if (!note) return body;
  return `${note}\n\n${body}`;
}
