import { EmbedBuilder, type ColorResolvable } from "discord.js";

export const PALETTE = {
  ok: 0xb71c1c,
  info: 0x263238,
  warn: 0xf9a825,
  err: 0x6a1b9a,
} satisfies Record<string, ColorResolvable>;

const footer = "ИИ Управление · канцелярия цифрового фронта";

export function embedOk(title: string, description: string) {
  return new EmbedBuilder()
    .setColor(PALETTE.ok)
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setFooter({ text: footer });
}

export function embedInfo(title: string, description: string) {
  return new EmbedBuilder()
    .setColor(PALETTE.info)
    .setTitle(`📋 ${title}`)
    .setDescription(description)
    .setFooter({ text: footer });
}

export function embedErr(title: string, description: string) {
  return new EmbedBuilder()
    .setColor(PALETTE.err)
    .setTitle(`⛔ ${title}`)
    .setDescription(description)
    .setFooter({ text: footer });
}

/** Выбытие, предупреждения — янтарный тон. */
export function embedWarn(title: string, description: string) {
  return new EmbedBuilder()
    .setColor(PALETTE.warn)
    .setTitle(`📤 ${title}`)
    .setDescription(description)
    .setFooter({ text: footer });
}

export function hierarchyBlocked() {
  return embedErr(
    "Нарушение иерархии",
    "Роль каталога **Штаб ИИ** должна быть **выше** редактируемой роли, и у бота должно быть право **«Управление ролями»**.",
  );
}
