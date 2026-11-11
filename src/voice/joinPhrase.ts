import {
  ChannelType,
  DiscordAPIError,
  Events,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type VoiceBasedChannel,
} from "discord.js";
import {
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { appendFeedEvent } from "../economy/feedStore.js";
import { mskYearMonth, quoteShopPrice } from "../economy/economyMacro.js";
import { remitShopPurchaseVatToTreasury } from "../economy/taxTreasury.js";
import { getEconomyUser, listEconomyUsers, updateEconomyUser } from "../economy/userStore.js";
import { joinSoundHoldMs } from "./soundDuration.js";

/** Умолчание покупки. Живая цена — `voiceJoinPhrasePriceRub`. */
export const VOICE_JOIN_PHRASE_PRICE_RUB = 10_000_000;

export function voiceJoinPhrasePriceRub(guildId: string): number {
  return quoteShopPrice(guildId, "voice:join");
}

export function voiceJoinMonthPriceRub(guildId: string): number {
  return quoteShopPrice(guildId, "voice:month");
}

export interface GuildJoinSound {
  soundId: string;
  name: string;
  /** Юникод-эмодзи звука, если оно есть. Свои эмодзи сервера в меню не подставляем. */
  emojiName?: string;
}

export type BuyVoiceJoinPhraseResult =
  | { ok: true }
  | { ok: false; kind: "owned" }
  | { ok: false; kind: "funds"; balance: number };

export function buyVoiceJoinPhrase(member: GuildMember): BuyVoiceJoinPhraseResult {
  const price = voiceJoinPhrasePriceRub(member.guild.id);
  const before = getEconomyUser(member.guild.id, member.id);
  if (before.voiceJoinPhrase) return { ok: false, kind: "owned" };
  let bought = false;
  let balance = before.rubles;
  const billYm = mskYearMonth();
  updateEconomyUser(member.guild.id, member.id, (cur) => {
    if (cur.voiceJoinPhrase) return cur;
    if (cur.rubles < price) {
      balance = cur.rubles;
      return cur;
    }
    bought = true;
    return {
      ...cur,
      rubles: cur.rubles - price,
      voiceJoinPhrase: true,
      voiceJoinBillYm: billYm,
      voiceJoinPaused: undefined,
    };
  });
  if (!bought) {
    if (getEconomyUser(member.guild.id, member.id).voiceJoinPhrase) return { ok: false, kind: "owned" };
    return { ok: false, kind: "funds", balance };
  }
  remitShopPurchaseVatToTreasury(member.guild.id, price);
  appendFeedEvent({
    ts: Date.now(),
    guildId: member.guild.id,
    type: "job:shift",
    actorUserId: member.id,
    text: `${member.toString()} купил фразу при входе в голосовой (−${price.toLocaleString("ru-RU")} ₽).`,
  });
  return { ok: true };
}

/** Раз в сутки: списать месячную плату за фразу. Покупка закрывает текущий месяц. */
export function settleVoiceJoinFees(guildId: string, nowMs: number = Date.now()): void {
  const ym = mskYearMonth(nowMs);
  const fee = voiceJoinMonthPriceRub(guildId);
  for (const { userId, user } of listEconomyUsers(guildId)) {
    if (!user.voiceJoinPhrase) continue;
    if (fee <= 0) {
      if (user.voiceJoinPaused) {
        updateEconomyUser(guildId, userId, (cur) => ({ ...cur, voiceJoinPaused: undefined }));
      }
      continue;
    }
    if (user.voiceJoinBillYm === ym) {
      if (user.voiceJoinPaused) {
        updateEconomyUser(guildId, userId, (cur) => ({ ...cur, voiceJoinPaused: undefined }));
      }
      continue;
    }
    const wasPaused = user.voiceJoinPaused === true;
    let paid = false;
    updateEconomyUser(guildId, userId, (cur) => {
      if (!cur.voiceJoinPhrase || cur.voiceJoinBillYm === ym) return cur;
      if (cur.rubles < fee) return { ...cur, voiceJoinPaused: true };
      paid = true;
      return { ...cur, rubles: cur.rubles - fee, voiceJoinBillYm: ym, voiceJoinPaused: undefined };
    });
    if (paid) {
      remitShopPurchaseVatToTreasury(guildId, fee);
      continue;
    }
    if (!wasPaused) {
      appendFeedEvent({
        ts: nowMs,
        guildId,
        type: "job:shift",
        actorUserId: userId,
        text: `Фраза входа на паузе: не хватило **${fee.toLocaleString("ru-RU")}** ₽ за месяц.`,
      });
    }
  }
}

export function clearVoiceJoinSound(guildId: string, userId: string): boolean {
  const u = getEconomyUser(guildId, userId);
  if (!u.voiceJoinPhrase) return false;
  updateEconomyUser(guildId, userId, (cur) => ({
    ...cur,
    voiceJoinSoundId: undefined,
    voiceJoinSoundName: undefined,
  }));
  return true;
}

/** Свои звуки саундборда этой гильдии (те, что добавляют в панели голоса). */
export async function listGuildJoinSounds(guild: Guild): Promise<GuildJoinSound[]> {
  const fetched = await guild.soundboardSounds.fetch();
  const sounds: GuildJoinSound[] = [];
  for (const sound of fetched.values()) {
    if (!sound.available) continue;
    if (sound.guildId && sound.guildId !== guild.id) continue;
    const emoji = sound.emoji;
    const emojiName =
      emoji && !emoji.id && typeof emoji.name === "string" && !/^[a-z0-9_]+$/i.test(emoji.name)
        ? emoji.name
        : undefined;
    const name = sound.name.replace(/[*`|_]/g, "").replace(/\s+/g, " ").trim().slice(0, 32) || "звук";
    if (sounds.some((row) => row.soundId === sound.soundId)) continue;
    sounds.push({ soundId: sound.soundId, name, emojiName });
  }
  sounds.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return sounds;
}

export async function assignVoiceJoinSound(
  member: GuildMember,
  soundId: string,
): Promise<{ ok: true; name: string } | { ok: false; reason: string }> {
  const u = getEconomyUser(member.guild.id, member.id);
  if (!u.voiceJoinPhrase) return { ok: false, reason: "Сначала купи фразу." };
  if (!/^\d{1,32}$/.test(soundId)) return { ok: false, reason: "Неизвестный звук." };
  const sounds = await listGuildJoinSounds(member.guild);
  const sound = sounds.find((s) => s.soundId === soundId);
  if (!sound) return { ok: false, reason: "Этого звука нет в саундборде сервера." };
  const live = member.guild.soundboardSounds.cache.get(sound.soundId);
  if (live) void joinSoundHoldMs(live);
  updateEconomyUser(member.guild.id, member.id, (cur) => ({
    ...cur,
    voiceJoinPhrase: true,
    voiceJoinSoundId: sound.soundId,
    voiceJoinSoundName: sound.name,
  }));
  return { ok: true, name: sound.name };
}

type PhraseJob = {
  guildId: string;
  channelId: string;
  soundId: string;
  userId: string;
};

const queues = new Map<string, PhraseJob[]>();
const running = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Поставить фразу в очередь гильдии. Повторный заход того же человека заменяет ещё не сыгранную. */
export function enqueueJoinPhrase(client: Client, job: PhraseJob): void {
  let q = queues.get(job.guildId);
  if (!q) {
    q = [];
    queues.set(job.guildId, q);
  }
  const idx = q.findIndex((j) => j.userId === job.userId);
  if (idx >= 0) q[idx] = job;
  else if (q.length < 12) q.push(job);
  void pumpJoinPhrases(client, job.guildId);
}

export function enqueueMemberJoinPhrase(client: Client, member: GuildMember, channel: VoiceBasedChannel): void {
  const u = getEconomyUser(member.guild.id, member.id);
  if (!u.voiceJoinPhrase || !u.voiceJoinSoundId) return;
  if (u.voiceJoinPaused && voiceJoinMonthPriceRub(member.guild.id) > 0) return;
  if (channel.type !== ChannelType.GuildVoice) return;
  if (channel.guild.afkChannelId === channel.id) return;
  enqueueJoinPhrase(client, {
    guildId: member.guild.id,
    channelId: channel.id,
    soundId: u.voiceJoinSoundId,
    userId: member.id,
  });
}

async function pumpJoinPhrases(client: Client, guildId: string): Promise<void> {
  if (running.has(guildId)) return;
  running.add(guildId);
  try {
    for (;;) {
      const job = queues.get(guildId)?.shift();
      if (!job) break;
      try {
        await playJoinPhrase(client, job);
      } catch (e) {
        console.warn("ИИ Управление: фраза входа не сыграла:", job.userId, e);
      }
    }
  } finally {
    running.delete(guildId);
    const left = queues.get(guildId);
    if (left && left.length > 0) {
      void pumpJoinPhrases(client, guildId);
      return;
    }
    queues.delete(guildId);
    getVoiceConnection(guildId)?.destroy();
  }
}

async function playJoinPhrase(client: Client, job: PhraseJob): Promise<void> {
  const guild = client.guilds.cache.get(job.guildId) ?? (await client.guilds.fetch(job.guildId).catch(() => null));
  if (!guild) return;
  const channel = guild.channels.cache.get(job.channelId) ?? (await guild.channels.fetch(job.channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) return;
  if (guild.afkChannelId === channel.id) return;

  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) return;
  const perms = channel.permissionsFor(me);
  if (
    !perms?.has(PermissionFlagsBits.Connect) ||
    !perms.has(PermissionFlagsBits.Speak) ||
    !perms.has(PermissionFlagsBits.UseSoundboard)
  ) {
    console.warn("ИИ Управление: нет прав играть фразу в канале", channel.id);
    return;
  }

  const soundPromise = guild.soundboardSounds.fetch(job.soundId).catch(() => null);
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });
  const ready = entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  ready.catch(() => undefined);

  const sound = await soundPromise;
  if (!sound?.available) {
    connection.destroy();
    console.warn("ИИ Управление: звук фразы недоступен:", job.soundId);
    return;
  }
  const holdPromise = joinSoundHoldMs(sound);
  try {
    await ready;
  } catch (e) {
    connection.destroy();
    throw e;
  }

  const started = Date.now();
  const sourceGuildId = sound.guildId ?? undefined;
  const send = () => channel.sendSoundboardSound({ soundId: sound.soundId, guildId: sourceGuildId });
  try {
    await send();
  } catch (e) {
    const retryable =
      e instanceof DiscordAPIError && (e.status === 429 || e.code === 40032 || e.code === 50167);
    if (!retryable) throw e;
    if (e.code === 50167) {
      await me.voice.setDeaf(false).catch(() => undefined);
      await me.voice.setMute(false).catch(() => undefined);
    }
    await sleep(e.status === 429 ? 1_000 : 400);
    await send();
  }
  const left = (await holdPromise) - (Date.now() - started);
  if (left > 0) await sleep(left);
}

export function registerVoiceJoinPhrases(client: Client): void {
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const member = newState.member;
    if (!member || member.user.bot) return;
    const channel = newState.channel;
    if (!channel || channel.id === oldState.channelId) return;
    enqueueMemberJoinPhrase(client, member, channel);
  });
}
