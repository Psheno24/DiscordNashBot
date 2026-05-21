import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
  type GuildMember,
} from "discord.js";
import { buildProfileCardMessagePayload } from "./economyShopAppearanceUi.js";

/** Досье в канале (видят все). */
export const profileCardPublicCommandName = "profile";
/** Своё досье (только вам). */
export const profileCardPrivateCommandName = "profile-me";

const USER_OPTION_NAME = "user";

export function profileCardSlashCommandsJson() {
  const profilePublic = new SlashCommandBuilder()
    .setName(profileCardPublicCommandName)
    .setDescription("Показать досье игрока в канале (все видят)")
    .addUserOption((opt) =>
      opt
        .setName(USER_OPTION_NAME)
        .setDescription("Чей профиль показать; не указывайте — будет ваш")
        .setRequired(false),
    )
    .toJSON();

  const profileMe = new SlashCommandBuilder()
    .setName(profileCardPrivateCommandName)
    .setDescription("Ваше досье — видно только вам")
    .toJSON();

  return [profilePublic, profileMe];
}

async function fetchGuildMember(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<GuildMember | null> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Команда работает только на сервере.", flags: MessageFlags.Ephemeral });
    return null;
  }
  try {
    return await guild.members.fetch(userId);
  } catch {
    await interaction.reply({
      content: "Участник не найден на этом сервере.",
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
}

async function resolveProfileTarget(
  interaction: ChatInputCommandInteraction,
  mode: "public" | "self-only",
): Promise<GuildMember | null> {
  const user =
    mode === "self-only" ? interaction.user : (interaction.options.getUser(USER_OPTION_NAME) ?? interaction.user);

  if (user.bot) {
    await interaction.reply({ content: "У ботов нет экономического досье.", flags: MessageFlags.Ephemeral });
    return null;
  }

  return fetchGuildMember(interaction, user.id);
}

async function sendProfileCard(
  interaction: ChatInputCommandInteraction,
  mode: "public" | "self-only",
): Promise<void> {
  const ephemeral = mode === "self-only";
  const target = await resolveProfileTarget(interaction, mode);
  if (!target) return;

  await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });

  try {
    const { file, content } = await buildProfileCardMessagePayload(target);
    await interaction.editReply({
      content: ephemeral ? (content ?? undefined) : `${target}`,
      files: [file],
      allowedMentions: ephemeral ? { parse: [] } : { users: [target.id] },
    });
  } catch (e) {
    console.error("profile card slash", e);
    await interaction.editReply({
      content:
        "Не удалось собрать карточку. Проверьте, что на сервере установлены шрифты (DejaVu) и доступен аватар.",
    });
  }
}

export async function handleProfileCardPrivateCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await sendProfileCard(interaction, "self-only");
}

export async function handleProfileCardPublicCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await sendProfileCard(interaction, "public");
}
