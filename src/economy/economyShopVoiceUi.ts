import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type GuildMember,
  type StringSelectMenuInteraction,
} from "discord.js";
import { ECON_SHOP_HUB, ECON_SHOP_VOICE, shopNavBottomRow, withShopNote } from "./economyShopUi.js";
import { getEconomyUser } from "./userStore.js";
import { PANEL_COLOR } from "../ui/theme.js";
import { UI } from "../ui/copy.js";
import {
  assignVoiceJoinSound,
  buyVoiceJoinPhrase,
  clearVoiceJoinSound,
  enqueueMemberJoinPhrase,
  listGuildJoinSounds,
  voiceJoinMonthPriceRub,
  voiceJoinPhrasePriceRub,
  type GuildJoinSound,
} from "../voice/joinPhrase.js";

const ECON_SHOP_VOICE_BUY = "econ:shop:voice:buy";
const ECON_SHOP_VOICE_OK = "econ:shop:voice:ok";
const ECON_SHOP_VOICE_CLEAR = "econ:shop:voice:clear";
const ECON_SHOP_VOICE_HEAR = "econ:shop:voice:hear";
const ECON_SHOP_VOICE_PAGE_PREFIX = "econ:shop:voice:p:";
const ECON_SHOP_VOICE_SELECT = "econ:shop:voice:sel";

const DISCORD_PAGE = 25;

type VoiceShopInteraction = ButtonInteraction | StringSelectMenuInteraction;

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function isVoiceJoinPhraseButton(id: string): boolean {
  return id === ECON_SHOP_VOICE || id.startsWith(`${ECON_SHOP_VOICE}:`);
}

export function isVoiceJoinPhraseSelect(id: string): boolean {
  return id === ECON_SHOP_VOICE_SELECT;
}

function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / DISCORD_PAGE));
}

export function buildVoiceJoinPhraseEmbed(
  member: GuildMember,
  sounds: GuildJoinSound[] | null,
  note?: string,
): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const buy = voiceJoinPhrasePriceRub(member.guild.id);
  const month = voiceJoinMonthPriceRub(member.guild.id);
  const monthLine =
    month > 0
      ? `Дальше **${fmt(month)}** ₽ каждый месяц (с 1-го числа, МСК). Не хватит — фраза на паузе.`
      : "Ежемесячная плата сейчас **0** ₽.";
  const lines = [`Баланс: **${fmt(u.rubles)}** ₽`, ""];
  if (!u.voiceJoinPhrase) {
    lines.push(
      `Фраза при входе в голосовой — **${fmt(buy)}** ₽.`,
      monthLine,
      "Дальше выбираешь звук из саундборда сервера. Слышат все, кто уже в канале.",
      "Свои звуки добавляются в панели голоса Discord.",
    );
  } else if (sounds == null) {
    lines.push("Фраза куплена.", "Не удалось загрузить саундборд. Открой раздел ещё раз.");
  } else {
    const current = u.voiceJoinSoundId ? sounds.find((s) => s.soundId === u.voiceJoinSoundId) : undefined;
    const label = current?.name ?? (u.voiceJoinSoundName ? `${u.voiceJoinSoundName} (нет в саундборде)` : "не выбрана");
    lines.push(`Фраза куплена. Сейчас: **${label}**.`, monthLine, "Сменить звук можно бесплатно. В списке есть поиск по имени.");
    if (u.voiceJoinPaused && month > 0) {
      lines.push("Подписка не оплачена — фраза на паузе, пока на счёте не хватит на месяц.");
    }
    if (sounds.length === 0) {
      lines.push("", "В саундборде сервера пока нет своих звуков. Добавь их в панели голоса и открой раздел снова.");
    } else {
      lines.push("В AFK и на трибуне фраза не играет.");
    }
  }
  const embed = new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Фраза при входе").setDescription(lines.join("\n"));
  return note ? withShopNote(embed, note) : embed;
}

function buildVoiceJoinPhraseRows(
  member: GuildMember,
  sounds: GuildJoinSound[] | null,
  page: number,
  confirm: boolean,
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const buy = voiceJoinPhrasePriceRub(member.guild.id);
  if (!u.voiceJoinPhrase) {
    if (confirm) {
      return [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(ECON_SHOP_VOICE_OK)
            .setLabel(`Подтвердить · ${fmt(buy)} ₽`.slice(0, 80))
            .setStyle(ButtonStyle.Success),
        ),
        shopNavBottomRow(ECON_SHOP_VOICE, UI.CANCEL),
      ];
    }
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_VOICE_BUY)
          .setLabel(`Купить · ${fmt(buy)} ₽`.slice(0, 80))
          .setStyle(ButtonStyle.Success),
      ),
      shopNavBottomRow(ECON_SHOP_HUB),
    ];
  }

  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  const list = sounds ?? [];
  const pages = pageCount(list.length);
  const safePage = Math.min(Math.max(0, page), pages - 1);
  const slice = list.slice(safePage * DISCORD_PAGE, safePage * DISCORD_PAGE + DISCORD_PAGE);
  const selected = u.voiceJoinSoundId ? list.find((s) => s.soundId === u.voiceJoinSoundId) : undefined;
  const selectedOnPage = selected != null && slice.some((s) => s.soundId === selected.soundId);
  const options = selected && !selectedOnPage ? [selected, ...slice.slice(0, DISCORD_PAGE - 1)] : slice;
  if (options.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(ECON_SHOP_VOICE_SELECT)
      .setPlaceholder(selected ? `Сейчас: ${selected.name}`.slice(0, 150) : "Выбери звук")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        options.map((sound) => ({
          label: (sound.name || "звук").slice(0, 100),
          value: sound.soundId,
          default: sound.soundId === u.voiceJoinSoundId,
          ...(sound.emojiName ? { emoji: { name: sound.emojiName } } : {}),
        })),
      );
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }

  const pageButtons: ButtonBuilder[] = [];
  if (pages > 1 && safePage > 0) {
    pageButtons.push(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_VOICE_PAGE_PREFIX}${safePage - 1}`)
        .setLabel("Предыдущие")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (pages > 1 && safePage < pages - 1) {
    pageButtons.push(
      new ButtonBuilder()
        .setCustomId(`${ECON_SHOP_VOICE_PAGE_PREFIX}${safePage + 1}`)
        .setLabel("Ещё звуки")
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (pageButtons.length > 0) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...pageButtons));
  if (u.voiceJoinSoundId) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_SHOP_VOICE_HEAR).setLabel("Прослушать").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(ECON_SHOP_VOICE_CLEAR).setLabel("Убрать звук").setStyle(ButtonStyle.Secondary),
      ),
    );
  }
  rows.push(shopNavBottomRow(ECON_SHOP_HUB));
  return rows;
}

async function showVoiceShop(
  interaction: VoiceShopInteraction,
  member: GuildMember,
  opts: { page?: number; note?: string; confirm?: boolean } = {},
): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }
  let sounds: GuildJoinSound[] | null = null;
  try {
    sounds = await listGuildJoinSounds(member.guild);
  } catch (e) {
    console.error("voice join phrase sounds:", e);
  }
  const page = opts.page ?? pageOfSelected(member, sounds);
  const payloadFor = (list: GuildJoinSound[] | null) => ({
    embeds: [buildVoiceJoinPhraseEmbed(member, list, opts.note)],
    components: buildVoiceJoinPhraseRows(member, list, page, opts.confirm === true),
  });
  try {
    await interaction.editReply(payloadFor(sounds));
  } catch (e) {
    console.error("voice join phrase screen:", e);
    const plain = sounds?.map((s) => ({ soundId: s.soundId, name: s.name })) ?? null;
    try {
      await interaction.editReply(payloadFor(plain));
    } catch (e2) {
      console.error("voice join phrase screen retry:", e2);
    }
  }
}

function pageOfSelected(member: GuildMember, sounds: GuildJoinSound[] | null): number {
  const id = getEconomyUser(member.guild.id, member.id).voiceJoinSoundId;
  if (!id || !sounds) return 0;
  const idx = sounds.findIndex((s) => s.soundId === id);
  if (idx < 0) return 0;
  return Math.floor(idx / DISCORD_PAGE);
}

function hearNote(member: GuildMember): string {
  const channel = member.voice.channel;
  if (!channel) return "Зайди в голосовой канал, чтобы прослушать.";
  if (channel.type !== ChannelType.GuildVoice) return "Фраза играет в обычном голосовом, не на трибуне.";
  if (channel.guild.afkChannelId === channel.id) return "В канале AFK фраза не играет.";
  const u = getEconomyUser(member.guild.id, member.id);
  if (!u.voiceJoinSoundId) return "Сначала выбери звук.";
  enqueueMemberJoinPhrase(member.client, member, channel);
  return "Слушай в голосовом.";
}

export async function handleVoiceJoinPhraseButton(
  interaction: ButtonInteraction,
  member: GuildMember,
): Promise<boolean> {
  const id = interaction.customId;
  if (!isVoiceJoinPhraseButton(id)) return false;

  if (id === ECON_SHOP_VOICE) {
    await showVoiceShop(interaction, member);
    return true;
  }
  if (id === ECON_SHOP_VOICE_BUY) {
    await showVoiceShop(interaction, member, { confirm: true });
    return true;
  }
  if (id === ECON_SHOP_VOICE_OK) {
    const result = buyVoiceJoinPhrase(member);
    if (!result.ok && result.kind === "funds") {
      await showVoiceShop(interaction, member, {
        confirm: true,
        note: `Нужно **${fmt(voiceJoinPhrasePriceRub(member.guild.id))}** ₽. На счёте **${fmt(result.balance)}** ₽.`,
      });
      return true;
    }
    await showVoiceShop(interaction, member, {
      note: result.ok ? "Куплено. Выбери звук в списке." : "Фраза уже куплена. Выбери звук.",
    });
    return true;
  }
  if (id === ECON_SHOP_VOICE_CLEAR) {
    clearVoiceJoinSound(member.guild.id, member.id);
    await showVoiceShop(interaction, member, { note: "Звук снят. При входе ничего не играет, пока не выберешь новый." });
    return true;
  }
  if (id === ECON_SHOP_VOICE_HEAR) {
    await showVoiceShop(interaction, member, { note: hearNote(member) });
    return true;
  }
  if (id.startsWith(ECON_SHOP_VOICE_PAGE_PREFIX)) {
    const page = Number.parseInt(id.slice(ECON_SHOP_VOICE_PAGE_PREFIX.length), 10);
    await showVoiceShop(interaction, member, { page: Number.isFinite(page) ? page : 0 });
    return true;
  }
  await showVoiceShop(interaction, member);
  return true;
}

export async function handleVoiceJoinPhraseSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (!isVoiceJoinPhraseSelect(interaction.customId)) return false;
  if (!interaction.inGuild() || !interaction.guild || !interaction.member) {
    await interaction.reply({ content: "Эта кнопка работает только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const member = interaction.member as GuildMember;
  if (member.user.bot) {
    await interaction.reply({ content: "Ботам экономика не положена.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }
  const soundId = interaction.values[0];
  if (!soundId) {
    await showVoiceShop(interaction, member);
    return true;
  }
  let note = "Не удалось сохранить звук. Попробуй ещё раз.";
  try {
    const assigned = await assignVoiceJoinSound(member, soundId);
    note = assigned.ok ? `Звук **${assigned.name}** будет играть при входе.` : assigned.reason;
  } catch (e) {
    console.error("voice join phrase assign:", e);
  }
  await showVoiceShop(interaction, member, { note });
  return true;
}
