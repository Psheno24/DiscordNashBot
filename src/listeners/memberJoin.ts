import { Events, type Client, type GuildMember, type User } from "discord.js";
import { loadRolesCatalog } from "../catalog/loadCatalog.js";
import { loadGuildState } from "../services/guildState.js";
import { LOWEST_LADDER_ROLE_KEY } from "../config/constants.js";

const NICK_MAX = 32;
const PREFIX = "Товарищ (";

/** Ник в формате «Товарищ (ник)», не длиннее лимита Discord. Только при первом входе. */
export function buildTovarischNickname(user: User): string {
  const raw = (user.globalName ?? user.username).trim() || "безымянный";
  const suffix = ")";
  let inner = raw;
  let nick = `${PREFIX}${inner}${suffix}`;
  while (nick.length > NICK_MAX && inner.length > 0) {
    inner = inner.slice(0, -1);
    nick = `${PREFIX}${inner}${suffix}`;
  }
  if (nick.length > NICK_MAX) {
    nick = nick.slice(0, NICK_MAX);
  }
  return nick;
}

function resolveLowestLadderRoleId(member: GuildMember): string | undefined {
  const state = loadGuildState(member.guild.id);
  const fromState = state.roleIds[LOWEST_LADDER_ROLE_KEY];
  if (fromState && member.guild.roles.cache.has(fromState)) return fromState;

  const catalog = loadRolesCatalog();
  const def = catalog.roles.find((r) => r.key === LOWEST_LADDER_ROLE_KEY);
  if (!def) return undefined;
  return member.guild.roles.cache.find((r) => r.name === def.name)?.id;
}

export function registerMemberJoin(client: Client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;
    if (member.id === member.guild.ownerId) return;

    try {
      const roleId = resolveLowestLadderRoleId(member);
      if (roleId) {
        await member.roles.add(roleId, "ИИ Управление: низшая ступень при вступлении");
      } else {
        console.warn(
          "ИИ Управление: роль низшей ступени не найдена — выполните /nadzor bootstrap или migrate.",
        );
      }
    } catch (e) {
      console.warn("ИИ Управление: не удалось выдать роль стажёра:", member.id, e);
    }

    try {
      const nick = buildTovarischNickname(member.user);
      await member.setNickname(nick, "ИИ Управление: униформа при вступлении");
    } catch (e) {
      console.warn("ИИ Управление: не удалось сменить ник:", member.id, e);
    }
  });
}
