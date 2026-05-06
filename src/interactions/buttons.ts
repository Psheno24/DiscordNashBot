import { type ButtonInteraction, AttachmentBuilder } from "discord.js";
import { embedErr, embedInfo, embedOk } from "../theme.js";
import { canRunInstall } from "./privilege.js";
import { runProvision, type ProvisionMode } from "../services/provision.js";
import { catalogSummaryLines } from "../panels/dashboard.js";

export async function handleButtonInteraction(interaction: ButtonInteraction): Promise<boolean> {
  const { customId } = interaction;
  if (!customId.startsWith("nz:")) return false;

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      embeds: [embedErr("Ошибка", "Только на сервере.")],
      ephemeral: true,
    });
    return true;
  }

  const member = await guild.members.fetch(interaction.user.id);

  if (customId.startsWith("nz:ad:")) {
    if (!canRunInstall(member, guild.ownerId)) {
      await interaction.reply({
        embeds: [embedErr("Отказано", "Пульт только для высшего состава с правами администратора.")],
        ephemeral: true,
      });
      return true;
    }

    if (customId === "nz:ad:reg") {
      await interaction.deferReply({ ephemeral: true });
      const lines = guild.roles.cache
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => {
          const hex = r.color === 0 ? "—" : `#${r.color.toString(16).padStart(6, "0")}`;
          return `${r.position.toString().padStart(3, " ")} · ${r.name} · ${hex} · ${r.id}`;
        })
        .join("\n");

      try {
        if (lines.length < 1800) {
          await interaction.user.send({ content: `\`\`\`\n${lines}\n\`\`\`` });
        } else {
          await interaction.user.send({
            files: [new AttachmentBuilder(Buffer.from(lines, "utf-8"), { name: "reestr-roles.txt" })],
          });
        }
        await interaction.editReply({
          embeds: [embedOk("Реестр отправлен", "Проверьте личные сообщения от бота.")],
        });
      } catch {
        await interaction.editReply({
          embeds: [
            embedErr(
              "Не удалось отправить",
              "Откройте ЛС боту или разрешите сообщения от участников сервера.",
            ),
          ],
        });
      }
      return true;
    }

    let mode: ProvisionMode = "full";
    if (customId === "nz:ad:full") mode = "full";
    else if (customId === "nz:ad:roles") mode = "roles";
    else if (customId === "nz:ad:ch") mode = "channels";
    else if (customId === "nz:ad:pan") mode = "panels";
    else return false;

    await interaction.deferReply({ ephemeral: true });
    try {
      const { summary } = await runProvision(guild, mode);
      await interaction.editReply({ embeds: [embedOk("Готово", summary)] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await interaction.editReply({ embeds: [embedErr("Сбой", msg)] });
    }
    return true;
  }

  if (customId.startsWith("nz:pu:")) {
    if (customId === "nz:pu:roles") {
      const body = catalogSummaryLines();
      await interaction.reply({
        ephemeral: true,
        embeds: [embedInfo("Состав ролей по каталогу", body.slice(0, 4000))],
      });
      return true;
    }
    if (customId === "nz:pu:help") {
      await interaction.reply({
        ephemeral: true,
        embeds: [
          embedInfo(
            "Помощь",
            [
              "Основные команды для администраторов: `/nadzor`, `/role`.",
              "Этот терминал — только справка. Жалобы и вопросы — к **Цензору** или **Секретарю**.",
              "Подробности о званиях: канал **#инфо-по-ролям**.",
            ].join("\n"),
          ),
        ],
      });
      return true;
    }
    if (customId === "nz:pu:staff") {
      await interaction.reply({
        ephemeral: true,
        embeds: [
          embedInfo(
            "Кому докладывать",
            "По нарушениям и спорным вопросам — к **Цензору** и **Секретарю**. По вопросам сервера целиком — **Политбюро**.",
          ),
        ],
      });
      return true;
    }
  }

  return false;
}
