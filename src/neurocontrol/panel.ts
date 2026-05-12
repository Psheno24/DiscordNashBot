import { EmbedBuilder, MessageFlags, type Client, type ButtonInteraction } from "discord.js";
import { neuroControlChannelId } from "../config.js";
import { loadNeurocontrol } from "./loadConfig.js";
import type { NeuroRoleEntry, NeurocontrolFile } from "./types.js";
import { getPanelMessageId, setPanelMessageId } from "./panelStore.js";
import { buildNeuroMainPanelRows, NEURO_MAIN_INFO } from "./adminHub.js";

const PANEL_COLOR = 0x263238;
const ROLES_COLOR = 0xb71c1c;

function buildPanelEmbed(cfg: NeurocontrolFile): EmbedBuilder {
  const e = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(cfg.panel.title)
    .setDescription(cfg.panel.description);
  if (cfg.panel.footer) e.setFooter({ text: cfg.panel.footer });
  return e;
}

function chunkFields(entries: NeuroRoleEntry[], perEmbed: number): NeuroRoleEntry[][] {
  const out: NeuroRoleEntry[][] = [];
  for (let i = 0; i < entries.length; i += perEmbed) {
    out.push(entries.slice(i, i + perEmbed));
  }
  return out;
}

function buildRoleEmbeds(roles: NeuroRoleEntry[]): EmbedBuilder[] {
  const chunks = chunkFields(roles, 25);
  return chunks.map((chunk, i) => {
    const e = new EmbedBuilder()
      .setColor(ROLES_COLOR)
      .setTitle(
        chunks.length > 1
          ? `Роли: обозначения и полномочия (${i + 1}/${chunks.length})`
          : "Роли: обозначения и полномочия",
      );
    for (const r of chunk) {
      const name = `${r.designation} · ${r.roleName}`.slice(0, 256);
      const value = r.capabilities.slice(0, 1024);
      e.addFields({ name, value, inline: false });
    }
    return e;
  });
}

export async function ensureNeuroPanel(client: Client) {
  for (const guild of client.guilds.cache.values()) {
    const chId = neuroControlChannelId(guild.id);
    if (!chId) continue;

    let cfg: NeurocontrolFile;
    try {
      cfg = loadNeurocontrol();
    } catch (e) {
      console.warn("ИИ Управление: neurocontrol.json не загружен, панель не выставлена:", e);
      continue;
    }

    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch?.isTextBased() || ch.isDMBased()) {
      console.warn("ИИ Управление: канал нейроконтроля недоступен или не текстовый:", chId);
      continue;
    }
    if (!ch.isSendable()) {
      console.warn("ИИ Управление: нет прав отправлять в канал нейроконтроля:", chId);
      continue;
    }

    const payload = {
      embeds: [buildPanelEmbed(cfg)],
      components: buildNeuroMainPanelRows(),
    };

    const storedId = getPanelMessageId(chId);
    if (storedId) {
      const msg = await ch.messages.fetch(storedId).catch(() => null);
      const botId = client.user?.id;
      if (msg && botId && msg.author.id === botId) {
        try {
          await msg.edit(payload);
          continue;
        } catch {
          /* создаём новое */
        }
      }
    }

    const sent = await ch.send(payload);
    setPanelMessageId(chId, sent.id);
  }
}

/** Кнопка «Инфо» — справочник ролей из neurocontrol.json. */
export async function handleNeuroButton(interaction: ButtonInteraction): Promise<boolean> {
  if (interaction.customId !== NEURO_MAIN_INFO) return false;

  let cfg: ReturnType<typeof loadNeurocontrol>;
  try {
    cfg = loadNeurocontrol();
  } catch {
    await interaction.reply({
      content: "Справочник ролей недоступен (ошибка `neurocontrol.json`).",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const embeds = buildRoleEmbeds(cfg.roles);
  await interaction.reply({ embeds, flags: MessageFlags.Ephemeral });
  return true;
}
