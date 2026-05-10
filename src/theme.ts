import { EmbedBuilder, type ColorResolvable } from "discord.js";

/** Кибер-СССР: неон на тёмном фоне Discord + канцелярская сетка. */
const PALETTE = {
  /** Зачисление — алого штриха боковой полосы */
  join: 0xff003c,
  /** Выбытие — «индустриальный» янтарь */
  leave: 0xff9100,
} satisfies Record<string, ColorResolvable>;

const footerBase = "ИИ Управление · канцелярия цифрового фронта";

function protocolId(): string {
  const n = Date.now() % 0xfff_fff;
  return `ПРТ-${n.toString(16).toUpperCase().padStart(5, "0")}`;
}

function joinDescription(description: string, stamp: string): string {
  return [
    "> **НЕЙРОКОМ** · узел учёта · гриф `«ОТКРЫТО»` · линия `КС-01`",
    "",
    description,
    "",
    `\`${stamp}\` · журнал синхронизирован · состояние \`+ ЗАЧИСЛЕН\``,
  ].join("\n");
}

function leaveDescription(description: string, stamp: string): string {
  return [
    "> **НЕЙРОКОМ** · узел учёта · гриф `«АРХИВ»` · линия `КС-01`",
    "",
    description,
    "",
    `\`${stamp}\` · запись закрыта · состояние \`− СПИСАН\``,
  ].join("\n");
}

export function embedInfo(title: string, description: string) {
  const stamp = protocolId();
  return new EmbedBuilder()
    .setColor(PALETTE.join)
    .setAuthor({ name: "НЕЙРОКОМ · цифровая канцелярия" })
    .setTitle(`〔 ${title} 〕`)
    .setDescription(joinDescription(description, stamp))
    .addFields(
      { name: "▸ ТИП СООБЩЕНИЯ", value: "`ЗАЧИСЛЕНИЕ`", inline: true },
      { name: "▸ ПОДСИСТЕМА", value: "`УЧЁТ ЛС`", inline: true },
      { name: "▸ КОНТУР", value: "`ИИ УПРАВЛЕНИЕ`", inline: true },
    )
    .setFooter({ text: `${footerBase} · ${stamp}` })
    .setTimestamp();
}

/** Выбытие — янтарный «аварийный» акцент. */
export function embedWarn(title: string, description: string) {
  const stamp = protocolId();
  return new EmbedBuilder()
    .setColor(PALETTE.leave)
    .setAuthor({ name: "НЕЙРОКОМ · цифровая канцелярия" })
    .setTitle(`〔 ${title} 〕`)
    .setDescription(leaveDescription(description, stamp))
    .addFields(
      { name: "▸ ТИП СООБЩЕНИЯ", value: "`ВЫБЫТИЕ`", inline: true },
      { name: "▸ ПОДСИСТЕМА", value: "`УЧЁТ ЛС`", inline: true },
      { name: "▸ КОНТУР", value: "`ИИ УПРАВЛЕНИЕ`", inline: true },
    )
    .setFooter({ text: `${footerBase} · ${stamp}` })
    .setTimestamp();
}
