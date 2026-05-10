import { EmbedBuilder, type ColorResolvable } from "discord.js";

/** Кибер-СССР: неон на тёмном фоне Discord + канцелярская сетка. */
const PALETTE = {
  /** Зачисление — алого штриха боковой полосы */
  join: 0xff003c,
  /** Выбытие — почти чёрный сангвиновый: боковая полоса как «печать исключения» */
  leave: 0x4a0404,
} satisfies Record<string, ColorResolvable>;

const footerBase = "ИИ Управление · канцелярия цифрового фронта";

function protocolId(): string {
  const n = Date.now() % 0xfff_fff;
  return `ПРТ-${n.toString(16).toUpperCase().padStart(5, "0")}`;
}

/** Штамп для выбытия — другая серия, суше и жёстче. */
function exclusionStamp(): string {
  const n = (Date.now() ^ 0x5a5a5a5a) % 0xfff_fff;
  return `ИЗК-${n.toString(16).toUpperCase().padStart(5, "0")}`;
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
    "> **ОТДЕЛ ИСКЛЮЧЕНИЙ** · контур `«ЧЁРНЫЙ АРХИВ»` · гриф `«К ОЗНАКОМЛЕНИЮ — НЕМЕДЛЕННО»`",
    "> Линия `П-9` · **живой реестр** закрыт для объекта",
    "",
    description,
    "",
    `\`${stamp}\` · **СТАТУС:** \`− ИСКЛЮЧЁН\` · учёт **запечатан**`,
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

/** Выбытие — «карта исключения»: холодный периметр, отдельно от приветствия. */
export function embedWarn(title: string, description: string) {
  const stamp = exclusionStamp();
  return new EmbedBuilder()
    .setColor(PALETTE.leave)
    .setAuthor({ name: "НЕЙРОКОМ · ОТДЕЛ ИСКЛЮЧЕНИЙ · узел периметра" })
    .setTitle(`▣ ${title} ▣`)
    .setDescription(leaveDescription(description, stamp))
    .addFields(
      { name: "▸ КЛАССИФИКАЦИЯ", value: "`ВЫБЫТИЕ / ИСКЛЮЧЕНИЕ`", inline: true },
      { name: "▸ РЕЖИМ УЗЛА", value: "`АРХИВ · ХОЛОДНЫЙ СЛОЙ`", inline: true },
      { name: "▸ КОНТУР", value: "`П-9 // ПЕРИМЕТР`", inline: true },
      {
        name: "\u200b",
        value:
          "```\n▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓\n```" +
            "**ВНИМАНИЕ УЗЛА:** объект снят с активного контура. Повторная постановка на учёт — **только по отдельному наряду** командования цифрового фронта.",
      },
      { name: "▸ СЛЕДСТВИЯ", value: "`ДОСТУП АННУЛИРОВАН` · `СЛЕД В ЖУРНАЛЕ ПЕРИМЕТРА`", inline: false },
    )
    .setFooter({ text: `${footerBase} · узел периметра · ${stamp}` })
    .setTimestamp();
}
