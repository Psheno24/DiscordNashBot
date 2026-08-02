import { EmbedBuilder, type ColorResolvable } from "discord.js";

/** Кибер-СССР: неон на тёмном фоне Discord + канцелярская сетка. */
const PALETTE = {
  /** Зачисление — алого штриха боковой полосы */
  join: 0xff003c,
  /** Выбытие — почти чёрный сангвиновый: боковая полоса как «печать исключения» */
  leave: 0x4a0404,
} satisfies Record<string, ColorResolvable>;

const footerBase = "Нейроком";

function protocolId(): string {
  const n = Date.now() % 0xfff_fff;
  return `ПРТ-${n.toString(16).toUpperCase().padStart(5, "0")}`;
}

/** Штамп для выбытия — другая серия, суше и жёстче. */
function exclusionStamp(): string {
  const n = (Date.now() ^ 0x5a5a5a5a) % 0xfff_fff;
  return `ИЗК-${n.toString(16).toUpperCase().padStart(5, "0")}`;
}

export function embedInfo(title: string, description: string) {
  const stamp = protocolId();
  return new EmbedBuilder()
    .setColor(PALETTE.join)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `${footerBase} · ${stamp}` })
    .setTimestamp();
}

/** Выбытие — «карта исключения»: холодный периметр, отдельно от приветствия. */
export function embedWarn(title: string, description: string) {
  const stamp = exclusionStamp();
  return new EmbedBuilder()
    .setColor(PALETTE.leave)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `${footerBase} · ${stamp}` })
    .setTimestamp();
}
