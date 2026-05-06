import type { Guild, TextChannel } from "discord.js";
import { loadRolesCatalog } from "../catalog/loadCatalog.js";
import {
  OWNER_ROLE_NAME,
  LOWEST_LADDER_ROLE_KEY,
  BOT_ROLE_KEY,
} from "../config/constants.js";
import {
  loadGuildState,
  saveGuildState,
} from "./guildState.js";
import {
  syncRolesFromCatalog,
  applyRoleOrder,
  provisionChannels,
} from "./provision.js";
import { postOrUpdatePanels } from "../panels/dashboard.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Однократная жёсткая миграция: каталог ролей, сброс участников на «Стажёр»,
 * удаление всех прочих ролей (кроме @everyone, managed, «Генсек», ролей каталога).
 * Владелец сервера и его роли не изменяются.
 */
export async function runGuildRoleMigration(guild: Guild): Promise<string> {
  const lines: string[] = [];
  const catalog = loadRolesCatalog();
  const state = loadGuildState(guild.id);

  lines.push("**1/** Синхронизация ролей по каталогу…");
  await guild.roles.fetch().catch(() => null);
  await syncRolesFromCatalog(guild, catalog, state);
  saveGuildState(guild.id, state);

  const lowestId = state.roleIds[LOWEST_LADDER_ROLE_KEY];
  if (!lowestId) {
    throw new Error("Не найдена роль низшей ступени (ключ stazhyr) после синхронизации.");
  }

  const catalogRoleIdSet = new Set(Object.values(state.roleIds));

  lines.push("**2/** Обход участников: снятие старых ролей и выдача «Стажёр»…");
  await guild.members.fetch().catch(() => null);

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    if (member.id === guild.ownerId) continue;

    const toRemove = [...member.roles.cache.values()].filter((r) => r.id !== guild.id);

    for (const r of toRemove) {
      try {
        await member.roles.remove(r, "Миграция: сброс ролей");
        await sleep(120);
      } catch {
        /* иерархия или права */
      }
    }

    try {
      if (!member.roles.cache.has(lowestId)) {
        await member.roles.add(lowestId, "Миграция: низшая ступень");
      }
    } catch {
      lines.push(`⚠ Не выдать «Стажёр» пользователю ${member.user.tag}.`);
    }
    await sleep(150);
  }

  lines.push("**3/** Удаление устаревших ролей…");
  await guild.roles.fetch().catch(() => null);

  for (const role of [...guild.roles.cache.values()]) {
    if (role.id === guild.id) continue;
    if (role.managed) continue;
    if (role.name === OWNER_ROLE_NAME) continue;
    if (catalogRoleIdSet.has(role.id)) continue;

    try {
      await role.delete("Миграция: роль вне каталога");
      lines.push(`— Удалена: **${role.name}**`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lines.push(`— Не удалена **${role.name}**: ${msg}`);
    }
    await sleep(350);
  }

  lines.push("**4/** Порядок ролей и служебная роль бота…");
  await guild.roles.fetch().catch(() => null);
  await applyRoleOrder(guild, catalog, state);

  const me = guild.members.me;
  const botRid = state.roleIds[BOT_ROLE_KEY];
  if (me && botRid && !me.roles.cache.has(botRid)) {
    await me.roles.add(botRid, "Миграция: ИИ Управление").catch(() => null);
  }

  lines.push("**5/** Каналы пульта и панели…");
  await provisionChannels(guild, catalog, state);
  saveGuildState(guild.id, state);

  const adminId = state.channelIds.adminPanel;
  const pubId = state.channelIds.publicPanel;
  if (adminId && pubId) {
    const admin = await guild.channels.fetch(adminId);
    const pub = await guild.channels.fetch(pubId);
    if (admin?.isTextBased() && pub?.isTextBased()) {
      await postOrUpdatePanels(
        guild.id,
        { admin: admin as TextChannel, public: pub as TextChannel },
        state,
      );
    }
  }

  saveGuildState(guild.id, state);
  lines.push("**Готово.** Владелец и роль «Генсек» не затрагивались. Раздайте штаб вручную.");

  const text = lines.join("\n");
  if (text.length > 3800) {
    return `${lines.slice(0, 15).join("\n")}\n… и ещё строк: смотрите лог сервера.`;
  }
  return text;
}
