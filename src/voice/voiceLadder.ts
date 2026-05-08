import { ChannelType, Events, type Client, type Guild, type GuildMember, type VoiceState } from "discord.js";
import { loadVoiceLadder } from "./loadLadder.js";
import type { VoiceLadderTier } from "./types.js";
import { addVoiceSeconds } from "./timeStore.js";
import { applyVoiceEarnings } from "../economy/voiceEarnings.js";
import { ensureEconomyFeedPanel } from "../economy/panel.js";
import { getEconomyUser } from "../economy/userStore.js";

/** Ключ сессии: время входа в «считаемый» голосовой канал (не AFK). */
const sessions = new Map<string, number>();

function sessionKey(guildId: string, userId: string) {
  return `${guildId}:${userId}`;
}

function isCountableChannelId(guild: Guild, channelId: string | null): boolean {
  if (!channelId) return false;
  if (guild.afkChannelId === channelId) return false;
  const ch = guild.channels.cache.get(channelId);
  return ch?.type === ChannelType.GuildVoice;
}

function isCountableState(state: VoiceState): boolean {
  // Не считаем, если self mute/deaf — пользователь “в канале”, но не участвует.
  if (state.selfMute || state.selfDeaf) return false;
  return isCountableChannelId(state.guild, state.channelId);
}

function resolveTierRoleIds(guild: Guild, ladder: VoiceLadderTier[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of ladder) {
    const role = guild.roles.cache.find((r) => r.name === t.roleName && !r.managed);
    if (role) m.set(t.roleName, role.id);
    else console.warn(`ИИ Управление: роль лестницы не найдена на сервере: «${t.roleName}»`);
  }
  return m;
}

async function applyVoiceLadder(member: GuildMember, ladder: VoiceLadderTier[], nameToId: Map<string, string>) {
  // Лестница считается по PS (ProgressScore), а не по “сырым минутам”.
  const totalPS = getEconomyUser(member.guild.id, member.id).psTotal;

  let targetTier: VoiceLadderTier = ladder[0]!;
  for (const t of ladder) {
    if (totalPS >= t.voiceMinutesTotal) targetTier = t;
  }

  const targetId = nameToId.get(targetTier.roleName);
  if (!targetId) return;

  // Снимаем только роли из этой лестницы, кроме целевой; прочие роли участника не трогаем.
  const ladderIds = new Set(nameToId.values());
  const toRemove = [...member.roles.cache.values()].filter(
    (r) => ladderIds.has(r.id) && r.id !== targetId,
  );

  try {
    for (const r of toRemove) {
      await member.roles.remove(r, "ИИ Управление: голосовая лестница");
    }
    if (!member.roles.cache.has(targetId)) {
      await member.roles.add(targetId, "ИИ Управление: голосовая лестница");
    }
  } catch (e) {
    console.warn(
      "ИИ Управление: не удалось обновить роли по голосу:",
      member.id,
      targetTier.roleName,
      e,
    );
  }
}

/** Первая ступень `voice-ladder.json` — эта роль выдаётся при вступлении (имя = роль на сервере). */
export async function resolveFirstLadderRoleId(guild: Guild): Promise<string | undefined> {
  try {
    const first = loadVoiceLadder().ladder[0];
    if (!first) return undefined;
    await guild.roles.fetch().catch(() => null);
    return guild.roles.cache.find((r) => r.name === first.roleName && !r.managed)?.id;
  } catch {
    return undefined;
  }
}

/** Выровнять роли участника по накопленному голосу (после выхода из голоса или при входе на сервер). */
export async function syncVoiceLadderForMember(member: GuildMember) {
  if (member.user.bot) return;
  let ladder: VoiceLadderTier[];
  try {
    ladder = loadVoiceLadder().ladder;
  } catch {
    return;
  }
  const nameToId = resolveTierRoleIds(member.guild, ladder);
  if (nameToId.size === 0) return;
  await applyVoiceLadder(member, ladder, nameToId);
}

export function registerVoiceLadder(client: Client) {
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const guild = newState.guild;
    const member = newState.member;
    if (!member || member.user.bot) return;

    const ids = [oldState.channelId, newState.channelId].filter(Boolean) as string[];
    for (const id of new Set(ids)) {
      if (!guild.channels.cache.has(id)) await guild.channels.fetch(id).catch(() => null);
    }

    const wasOk = isCountableState(oldState);
    const nowOk = isCountableState(newState);
    const key = sessionKey(guild.id, member.id);

    if (wasOk && !nowOk) {
      const start = sessions.get(key);
      sessions.delete(key);
      if (start != null) {
        const delta = Math.floor((Date.now() - start) / 1000);
        if (delta > 0) {
          addVoiceSeconds(guild.id, member.id, delta);
          applyVoiceEarnings({ guildId: guild.id, userId: member.id, deltaSeconds: delta, actorMention: member.toString() });
          await ensureEconomyFeedPanel(client);
          await syncVoiceLadderForMember(member);
        }
      }
      return;
    }

    if (!wasOk && nowOk) {
      sessions.set(key, Date.now());
      return;
    }

    if (wasOk && nowOk && oldState.channelId !== newState.channelId) {
      // Перешёл между обычными голосовыми — сессия не сбрасывается
    }
  });
}
