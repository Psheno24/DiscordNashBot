import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { embedErr, embedOk } from "../theme.js";
import { runProvision, type ProvisionMode } from "../services/provision.js";
import { canRunInstall } from "../interactions/privilege.js";
import { runGuildRoleMigration } from "../services/migration.js";
import { MIGRATE_CONFIRM_PHRASE } from "../config/constants.js";

export const nadzorSlash = new SlashCommandBuilder()
  .setName("nadzor")
  .setDescription("Развёртывание инфраструктуры ИИ Управления")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((s) =>
    s
      .setName("bootstrap")
      .setDescription("Роли, каналы и панели с кнопками — полный цикл"),
  )
  .addSubcommand((s) =>
    s.setName("roles").setDescription("Только синхронизация ролей и порядка"),
  )
  .addSubcommand((s) =>
    s.setName("channels").setDescription("Только каналы пульта и терминала"),
  )
  .addSubcommand((s) =>
    s.setName("panels").setDescription("Только обновить сообщения с кнопками"),
  )
  .addSubcommand((s) =>
    s
      .setName("migrate")
      .setDescription("ОПАСНО: сброс ролей участников и удаление ролей вне каталога")
      .addStringOption((o) =>
        o
          .setName("confirm")
          .setDescription(`Введите точно: ${MIGRATE_CONFIRM_PHRASE}`)
          .setRequired(true),
      ),
  );

function modeFromSub(name: string): ProvisionMode {
  switch (name) {
    case "bootstrap":
      return "full";
    case "roles":
      return "roles";
    case "channels":
      return "channels";
    case "panels":
      return "panels";
    default:
      return "full";
  }
}

export async function handleNadzorCommand(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      embeds: [embedErr("Ошибка", "Только на сервере.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const gm: GuildMember = await guild.members.fetch(interaction.user.id);
  if (!canRunInstall(gm, guild.ownerId)) {
    await interaction.reply({
      embeds: [embedErr("Отказано", "Нужны права администратора или статус владельца.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sub = interaction.options.getSubcommand(true);

  if (sub === "migrate") {
    if (interaction.user.id !== guild.ownerId) {
      await interaction.reply({
        embeds: [embedErr("Отказано", "Миграцию может запустить только владелец сервера.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const confirm = interaction.options.getString("confirm", true).trim();
    if (confirm !== MIGRATE_CONFIRM_PHRASE) {
      await interaction.reply({
        embeds: [
          embedErr(
            "Подтверждение",
            `Введите ровно \`${MIGRATE_CONFIRM_PHRASE}\` (латиницей, заглавными).`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const report = await runGuildRoleMigration(guild);
      await interaction.editReply({
        embeds: [embedOk("Миграция завершена", report)],
      });
    } catch (e) {
      console.error("nadzor migrate:", e);
      const msg = e instanceof Error ? e.message : String(e);
      await interaction.editReply({
        embeds: [embedErr("Сбой миграции", msg)],
      });
    }
    return;
  }

  const mode = modeFromSub(sub);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { summary } = await runProvision(guild, mode);
    await interaction.editReply({
      embeds: [embedOk("Приказ выполнен", summary)],
    });
  } catch (e) {
    console.error("nadzor provision:", e);
    const msg = e instanceof Error ? e.message : String(e);
    await interaction.editReply({
      embeds: [embedErr("Сбой развёртывания", msg)],
    });
  }
}
