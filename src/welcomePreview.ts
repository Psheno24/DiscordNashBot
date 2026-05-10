import {
  type ChatInputCommandInteraction,
  type Client,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { discordToken } from "./config.js";
import { randomJoinCopy } from "./copy/ussrMemberActivity.js";
import { embedInfo } from "./theme.js";

/** Имя слэш-команды (латиница, требование Discord). */
export const welcomePreviewCommandName = "welcome-preview";

const data = new SlashCommandBuilder()
  .setName(welcomePreviewCommandName)
  .setDescription("Случайное приветственное сообщение учёта (как при вступлении на сервер)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((opt) =>
    opt
      .setName("member")
      .setDescription("Чей ник подставить в текст (по умолчанию — вы)")
      .setRequired(false),
  );

export async function registerWelcomePreviewCommands(client: Client) {
  const appId = client.user?.id;
  if (!appId) return;

  const rest = new REST({ version: "10" }).setToken(discordToken());
  const body = [data.toJSON()];

  for (const guild of client.guilds.cache.values()) {
    try {
      await rest.put(Routes.applicationGuildCommands(appId, guild.id), { body });
    } catch (e) {
      console.warn("ИИ Управление: не удалось зарегистрировать welcome-preview на гильдии", guild.id, e);
    }
  }
}

export async function handleWelcomePreviewCommand(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Команда только на сервере.", ephemeral: true });
    return;
  }

  const target = interaction.options.getUser("member") ?? interaction.user;
  const { title, description } = randomJoinCopy(target.tag, guild.name);

  await interaction.reply({
    content: target.id === interaction.user.id ? `${interaction.user}` : `${target}`,
    embeds: [embedInfo(title, description)],
    allowedMentions: { users: [target.id] },
  });
}
