import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type TextChannel,
} from "discord.js";
import { PALETTE } from "../theme.js";
import { loadRolesCatalog } from "../catalog/loadCatalog.js";
import {
  loadGuildState,
  saveGuildState,
  type GuildInstallState,
} from "../services/guildState.js";

const foot = { text: "ИИ Управление · канцелярия цифрового фронта" };

export function buildAdminPanelEmbed() {
  return new EmbedBuilder()
    .setColor(PALETTE.info)
    .setTitle("🛰 Пульт ИИ Управления")
    .setDescription(
      [
        "**Доступ:** Политбюро, Цензор, Секретарь (и владелец сервера).",
        "",
        "· **Полное развёртывание** — роли по каталогу, порядок, два канала, эти кнопки.",
        "· **Синхрон ролей** — только роли и позиции.",
        "· **Каналы** — пересоздать/обновить `#пульт-красноармейца` и `#терминал-наркомата` с правами.",
        "· **Обновить кнопки** — перерисовать панели (если сбились).",
        "· **Реестр в личку** — список ролей только вам.",
        "",
        "Жёсткая миграция только слэшем: `/nadzor migrate` (только владелец, см. описание команды).",
      ].join("\n"),
    )
    .setFooter(foot);
}

export function buildPublicPanelEmbed() {
  return new EmbedBuilder()
    .setColor(PALETTE.ok)
    .setTitle("⌨ Терминал наркомата")
    .setDescription(
      [
        "Народный интерфейс **ИИ Управления**. Здесь только справки — без администрирования.",
        "",
        "Полное управление ролями — у высшего состава в закрытом пульте.",
        "Справочник по званиям смотрите в **#инфо-по-ролям**.",
      ].join("\n"),
    )
    .setFooter(foot);
}

export function adminPanelRows() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("nz:ad:full")
        .setLabel("Полное развёртывание")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("nz:ad:roles")
        .setLabel("Синхрон ролей")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("nz:ad:ch")
        .setLabel("Каналы")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("nz:ad:pan")
        .setLabel("Обновить кнопки")
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("nz:ad:reg")
        .setLabel("Реестр в личку")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function publicPanelRows() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("nz:pu:roles")
        .setLabel("О ролях")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("nz:pu:help")
        .setLabel("Помощь")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("nz:pu:staff")
        .setLabel("Кому докладывать")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export async function postOrUpdatePanels(
  guildId: string,
  channels: { admin: TextChannel; public: TextChannel },
  existing?: GuildInstallState,
) {
  const state = existing ?? loadGuildState(guildId);

  const adminPayload = {
    embeds: [buildAdminPanelEmbed()],
    components: adminPanelRows(),
  };

  const pubPayload = {
    embeds: [buildPublicPanelEmbed()],
    components: publicPanelRows(),
  };

  if (state.panelMessageIds.adminPanel) {
    try {
      const m = await channels.admin.messages.fetch(state.panelMessageIds.adminPanel);
      await m.edit(adminPayload);
    } catch {
      const m = await channels.admin.send(adminPayload);
      state.panelMessageIds.adminPanel = m.id;
    }
  } else {
    const m = await channels.admin.send(adminPayload);
    state.panelMessageIds.adminPanel = m.id;
  }

  if (state.panelMessageIds.publicPanel) {
    try {
      const m = await channels.public.messages.fetch(state.panelMessageIds.publicPanel);
      await m.edit(pubPayload);
    } catch {
      const m = await channels.public.send(pubPayload);
      state.panelMessageIds.publicPanel = m.id;
    }
  } else {
    const m = await channels.public.send(pubPayload);
    state.panelMessageIds.publicPanel = m.id;
  }

  saveGuildState(guildId, state);
}

export function catalogSummaryLines(): string {
  const c = loadRolesCatalog();
  return c.roles.map((r) => `**${r.name}** (${r.layer}) — ${r.assignment}`).join("\n");
}
