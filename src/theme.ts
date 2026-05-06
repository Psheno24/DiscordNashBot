import { EmbedBuilder, type ColorResolvable } from "discord.js";

const PALETTE = {
  info: 0x263238,
  warn: 0xf9a825,
} satisfies Record<string, ColorResolvable>;

const footer = "ИИ Управление · канцелярия цифрового фронта";

export function embedInfo(title: string, description: string) {
  return new EmbedBuilder()
    .setColor(PALETTE.info)
    .setTitle(`📋 ${title}`)
    .setDescription(description)
    .setFooter({ text: footer });
}

/** Выбытие — янтарный тон. */
export function embedWarn(title: string, description: string) {
  return new EmbedBuilder()
    .setColor(PALETTE.warn)
    .setTitle(`📤 ${title}`)
    .setDescription(description)
    .setFooter({ text: footer });
}
