import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { getEconomyUser, patchEconomyUser } from "./userStore.js";

export const setIpEffCommandName = "setipeff";

export const setIpEffCommand = new SlashCommandBuilder()
  .setName(setIpEffCommandName)
  .setDescription("Выставить эффективность ИП (×0.3…×1.0), только владелец сервера")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((o) => o.setName("member").setDescription("Кому").setRequired(true))
  .addNumberOption((o) =>
    o
      .setName("coeff")
      .setDescription("Эффективность суточного оклада (например 1 или 0.5)")
      .setRequired(true)
      .setMinValue(0.3)
      .setMaxValue(1),
  );

async function isGuildOwner(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guildId) return false;
  const g =
    interaction.guild ?? (await interaction.client.guilds.fetch(interaction.guildId).catch(() => null));
  return Boolean(g && g.ownerId === interaction.user.id);
}

export async function handleSetIpEffCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Команда только на сервере.", ephemeral: true });
    return;
  }
  if (!(await isGuildOwner(interaction))) {
    await interaction.reply({
      content: "Эту команду может использовать только **владелец сервера**.",
      ephemeral: true,
    });
    return;
  }

  const target = interaction.options.getUser("member", true);
  if (target.bot) {
    await interaction.reply({ content: "Ботам эффективность ИП не выставляется.", ephemeral: true });
    return;
  }

  const raw = interaction.options.getNumber("coeff", true);
  const coeff = Math.round(raw * 10) / 10;
  if (coeff < 0.3 || coeff > 1 || Math.abs(coeff * 10 - Math.round(coeff * 10)) > 1e-9) {
    await interaction.reply({
      content: "Коэффициент должен быть от **0.3** до **1.0** с шагом **0.1** (например `0.3`, `0.7`, `1`).",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  const before = getEconomyUser(guildId, target.id);
  const prev = before.solePropPassiveEffMult ?? 1;
  patchEconomyUser(guildId, target.id, {
    solePropPassiveEffMult: coeff,
    solePropControlRecoverFails: 0,
    solePropMissedControlStreak: 0,
  });

  const jobNote =
    before.jobId === "soleProp"
      ? ""
      : "\n_Сейчас у игрока не ИП — значение сохранится и применится, когда он на ИП._";

  await interaction.reply({
    content: `${target}: эффективность ИП **×${prev.toFixed(1)}** → **×${coeff.toFixed(1)}**.${jobNote}`,
    ephemeral: true,
  });
}
