import {
  ChannelType,
  type Guild,
  PermissionFlagsBits,
  type TextChannel,
  type OverwriteResolvable,
} from "discord.js";
import type { CatalogRole, RolesCatalog } from "../catalog/types.js";
import { loadRolesCatalog } from "../catalog/loadCatalog.js";
import { resolvePermissionNames } from "./permissions.js";
import {
  loadGuildState,
  saveGuildState,
  type GuildInstallState,
} from "./guildState.js";
import { postOrUpdatePanels } from "../panels/dashboard.js";
import { BOT_ROLE_KEY } from "../config/constants.js";

function parseColor(hex: string): number {
  return Number.parseInt(hex.replace(/^#/, ""), 16);
}

/** discord.js: `color` устарел, API ожидает `colors.primaryColor`. */
function roleColorOptions(hex: string): { colors: { primaryColor: number } } {
  return { colors: { primaryColor: parseColor(hex) } };
}

async function ensureBotWearsCatalogRole(guild: Guild, state: GuildInstallState) {
  const botRoleId = state.roleIds[BOT_ROLE_KEY];
  if (!botRoleId) return;
  const me = guild.members.me;
  if (!me) return;
  if (!me.roles.cache.has(botRoleId)) {
    await me.roles.add(botRoleId, "ИИ Управление: служебная роль для иерархии");
  }
  await me.fetch(true).catch(() => null);
}

async function syncSingleCatalogRole(
  guild: Guild,
  def: CatalogRole,
  state: GuildInstallState,
): Promise<void> {
  // Не совпадать с интеграционной ролью приложения (managed): её нельзя править через Role#edit.
  let role = guild.roles.cache.find(
    (r) => r.name === def.name && !r.managed,
  );
  const colorOpts = roleColorOptions(def.color);
  const perms = resolvePermissionNames(def.permissions);

  try {
    if (!role) {
      role = await guild.roles.create({
        name: def.name,
        ...colorOpts,
        hoist: def.hoist,
        mentionable: def.mentionable,
        permissions: perms,
        reason: "ИИ Управление: учреждение по каталогу",
      });
    } else {
      await role.edit({
        name: def.name,
        ...colorOpts,
        hoist: def.hoist,
        mentionable: def.mentionable,
        permissions: perms,
        reason: "ИИ Управление: синхронизация каталога",
      });
    }
  } catch (e) {
    const detail = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
    console.error(`ИИ Управление: роль каталога key=${def.key} name="${def.name}":`, detail);
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Роль «${def.name}» (${def.key}): ${msg}`);
  }

  state.roleIds[def.key] = role.id;
}

function findCategory(guild: Guild, name: string) {
  return (
    guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === name,
    ) ?? null
  );
}

async function ensureCategory(guild: Guild, name: string) {
  const found = findCategory(guild, name);
  if (found) return found;
  return guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    reason: "ИИ Управление: категория из каталога",
  });
}

async function ensureTextChannel(
  guild: Guild,
  parentId: string | null,
  name: string,
  topic: string,
  overwrites?: OverwriteResolvable[],
): Promise<TextChannel> {
  await guild.channels.fetch().catch(() => null);
  const existing = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      c.name === name &&
      (parentId ? c.parentId === parentId : c.parentId === null),
  );
  if (existing?.isTextBased()) {
    const t = existing as TextChannel;
    await t.edit({ topic, permissionOverwrites: overwrites }).catch(() => null);
    return t;
  }

  const created = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parentId ?? undefined,
    topic,
    permissionOverwrites: overwrites,
    reason: "ИИ Управление: канал из каталога",
  });
  return created as TextChannel;
}

export async function syncRolesFromCatalog(
  guild: Guild,
  catalog: RolesCatalog,
  state: GuildInstallState,
) {
  await guild.roles.fetch().catch(() => null);

  const ordered = [...catalog.roles];
  const botIdx = ordered.findIndex((r) => r.key === BOT_ROLE_KEY);
  if (botIdx >= 0) {
    const [botDef] = ordered.splice(botIdx, 1);
    await syncSingleCatalogRole(guild, botDef, state);
    await ensureBotWearsCatalogRole(guild, state);
  }

  for (const def of ordered) {
    await syncSingleCatalogRole(guild, def, state);
  }

  await guild.roles.fetch().catch(() => null);
  await applyRoleOrder(guild, catalog, state);
  await ensureBotWearsCatalogRole(guild, state);
}

export async function applyRoleOrder(guild: Guild, catalog: RolesCatalog, state: GuildInstallState) {
  await guild.roles.fetch();
  const oursOrdered = catalog.roleOrderTopToBottom.map((k) => state.roleIds[k]).filter(Boolean);
  if (oursOrdered.length === 0) return;

  const allIds = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => r.id);

  const rest = allIds.filter((id) => !oursOrdered.includes(id));
  const newOrder = [...oursOrdered, ...rest];

  const payload = newOrder.map((id, idx) => ({
    role: id,
    position: newOrder.length - idx,
  }));

  try {
    await guild.roles.setPositions(payload);
  } catch (e) {
    console.error("ИИ Управление: не удалось выставить позиции ролей:", e);
  }
}

export async function provisionChannels(
  guild: Guild,
  catalog: RolesCatalog,
  state: GuildInstallState,
) {
  const adminCat = await ensureCategory(guild, catalog.server.categories.admin);
  const pubCat = await ensureCategory(guild, catalog.server.categories.publicRoot);

  const adminOverwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: guild.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    ...catalog.server.adminVisibilityRoles
      .map((k) => state.roleIds[k])
      .filter(Boolean)
      .map((rid) => ({
        id: rid,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
        ],
      })),
  ];

  const adminCh = await ensureTextChannel(
    guild,
    adminCat.id,
    catalog.server.channels.adminPanel.name,
    catalog.server.channels.adminPanel.topic,
    adminOverwrites,
  );

  const publicCh = await ensureTextChannel(
    guild,
    pubCat.id,
    catalog.server.channels.publicPanel.name,
    catalog.server.channels.publicPanel.topic,
  );

  state.channelIds.adminPanel = adminCh.id;
  state.channelIds.publicPanel = publicCh.id;
}

export type ProvisionMode = "full" | "roles" | "channels" | "panels";

export async function runProvision(
  guild: Guild,
  mode: ProvisionMode,
): Promise<{ summary: string }> {
  const catalog = loadRolesCatalog();
  const state = loadGuildState(guild.id);
  const lines: string[] = [];

  if (mode === "full" || mode === "roles") {
    await syncRolesFromCatalog(guild, catalog, state);
    lines.push("Роли синхронизированы по каталогу; порядок обновлён.");
  }

  if (mode === "full" || mode === "channels") {
    const missing = catalog.server.adminVisibilityRoles.some((k) => !state.roleIds[k]);
    if (missing) {
      await syncRolesFromCatalog(guild, catalog, state);
      lines.push("Роли досинхронизированы — нужны id для прав закрытого пульта.");
    }
    await provisionChannels(guild, catalog, state);
    lines.push(
      `Каналы: **#${catalog.server.channels.adminPanel.name}** · **#${catalog.server.channels.publicPanel.name}**.`,
    );
  }

  saveGuildState(guild.id, state);

  if (mode === "full" || mode === "panels") {
    const adminId = state.channelIds.adminPanel;
    const pubId = state.channelIds.publicPanel;
    if (!adminId || !pubId) {
      lines.push("Панели не выставлены: сначала создайте каналы (полный bootstrap или кнопка «Каналы»).");
    } else {
      const admin = await guild.channels.fetch(adminId);
      const pub = await guild.channels.fetch(pubId);
      if (admin?.isTextBased() && pub?.isTextBased()) {
        await postOrUpdatePanels(
          guild.id,
          { admin: admin as TextChannel, public: pub as TextChannel },
          state,
        );
        lines.push("Панели с кнопками обновлены.");
      } else {
        lines.push("Не удалось открыть текстовые каналы панелей.");
      }
    }
  }

  return { summary: lines.join("\n") };
}
