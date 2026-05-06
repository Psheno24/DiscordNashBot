import {
  type ChatInputCommandInteraction,
  type Guild,
  PermissionFlagsBits,
  SlashCommandBuilder,
  AttachmentBuilder,
} from "discord.js";
import { embedErr, embedInfo, embedOk, hierarchyBlocked } from "../theme.js";

function parseColor(input: string | null): number | null {
  if (!input) return null;
  const s = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return Number.parseInt(s, 16);
}

function formatRoleLine(
  name: string,
  id: string,
  position: number,
  primaryColor: number,
): string {
  const hex = primaryColor === 0 ? "—" : `#${primaryColor.toString(16).padStart(6, "0")}`;
  return `${position.toString().padStart(3, " ")} · ${name} · ${hex} · \`${id}\``;
}

function botCanManageRole(guild: Guild, roleId: string): boolean {
  const me = guild.members.me;
  if (!me) return false;
  const role = guild.roles.cache.get(roleId);
  if (!role) return false;
  return me.roles.highest.position > role.position;
}

function resolveRole(guild: Guild, roleId: string) {
  return guild.roles.cache.get(roleId) ?? null;
}

export const roleSlash = new SlashCommandBuilder()
  .setName("role")
  .setDescription("Управление ролями сервера")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((s) =>
    s
      .setName("list")
      .setDescription("Реестр ролей: позиция, цвет, идентификатор"),
  )
  .addSubcommand((s) =>
    s
      .setName("create")
      .setDescription("Создать роль")
      .addStringOption((o) =>
        o.setName("name").setDescription("Наименование").setRequired(true),
      )
      .addStringOption((o) =>
        o.setName("color").setDescription("Цвет HEX, например CC0000"),
      )
      .addBooleanOption((o) =>
        o.setName("hoist").setDescription("Отдельный блок в списке участников"),
      )
      .addBooleanOption((o) =>
        o.setName("mentionable").setDescription("Разрешить пинг этой роли"),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("edit")
      .setDescription("Правка роли")
      .addRoleOption((o) => o.setName("role").setDescription("Роль").setRequired(true))
      .addStringOption((o) => o.setName("name").setDescription("Новое наименование"))
      .addStringOption((o) =>
        o.setName("color").setDescription("Цвет HEX, например CC0000"),
      )
      .addBooleanOption((o) =>
        o.setName("hoist").setDescription("Отдельный блок в списке участников"),
      )
      .addBooleanOption((o) =>
        o.setName("mentionable").setDescription("Разрешить пинг этой роли"),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("delete")
      .setDescription("Удалить роль")
      .addRoleOption((o) => o.setName("role").setDescription("Роль").setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("give")
      .setDescription("Выдать роль участнику")
      .addUserOption((o) => o.setName("user").setDescription("Участник").setRequired(true))
      .addRoleOption((o) => o.setName("role").setDescription("Роль").setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("take")
      .setDescription("Снять роль с участника")
      .addUserOption((o) => o.setName("user").setDescription("Участник").setRequired(true))
      .addRoleOption((o) => o.setName("role").setDescription("Роль").setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("clone")
      .setDescription("Клонировать роль под новым именем")
      .addRoleOption((o) =>
        o.setName("source").setDescription("Исходная роль").setRequired(true),
      )
      .addStringOption((o) =>
        o.setName("name").setDescription("Наименование копии").setRequired(true),
      ),
  );

export async function handleRoleCommand(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      embeds: [embedErr("Неверный театр операций", "Команда только на сервере.")],
      ephemeral: true,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  try {
    if (sub === "list") {
      const roles = guild.roles.cache
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => formatRoleLine(r.name, r.id, r.position, r.colors.primaryColor));

      const header =
        "**Реестр ролей** (сверху вниз по позиции). @everyone исключён из списка.\n\n```\n";
      const footer = "\n```";

      const body = roles.join("\n");
      const text = header + body + footer;

      if (text.length <= 3900) {
        await interaction.reply({ embeds: [embedInfo("Реестр ролей", text)] });
      } else {
        const file = new AttachmentBuilder(Buffer.from(roles.join("\n"), "utf-8"), {
          name: "roles-registry.txt",
        });
        await interaction.reply({
          embeds: [
            embedInfo(
              "Реестр ролей",
              "Список слишком длинный для вложения в сообщение — см. файл `roles-registry.txt`.",
            ),
          ],
          files: [file],
        });
      }
      return;
    }

    if (sub === "create") {
      const name = interaction.options.getString("name", true);
      const colorRaw = interaction.options.getString("color");
      const hoist = interaction.options.getBoolean("hoist") ?? false;
      const mentionable = interaction.options.getBoolean("mentionable") ?? false;
      const color = parseColor(colorRaw);
      if (colorRaw && color === null) {
        await interaction.reply({
          embeds: [embedErr("Ошибка цвета", "Укажите HEX из шести символов, например `CC0000`.")],
          ephemeral: true,
        });
        return;
      }

      const created = await guild.roles.create({
        name,
        ...(color !== null ? { colors: { primaryColor: color } } : {}),
        hoist,
        mentionable,
        reason: `ИИ Управление: создал ${interaction.user.tag}`,
      });

      await interaction.reply({
        embeds: [
          embedOk(
            "Роль учреждена",
            `**${created.name}** · ${created.id}\nПозиция: **${created.position}**`,
          ),
        ],
      });
      return;
    }

    if (sub === "edit") {
      const opt = interaction.options.getRole("role", true);
      if (opt.id === guild.id) {
        await interaction.reply({
          embeds: [embedErr("Запрещено", "@everyone нельзя править этой командой.")],
          ephemeral: true,
        });
        return;
      }
      const role = resolveRole(guild, opt.id);
      if (!role) {
        await interaction.reply({
          embeds: [embedErr("Роль не найдена", "Повторите команду после синхронизации кэша.")],
          ephemeral: true,
        });
        return;
      }
      if (!botCanManageRole(guild, role.id)) {
        await interaction.reply({ embeds: [hierarchyBlocked()], ephemeral: true });
        return;
      }

      const name = interaction.options.getString("name") ?? undefined;
      const colorRaw = interaction.options.getString("color");
      const hoist = interaction.options.getBoolean("hoist");
      const mentionable = interaction.options.getBoolean("mentionable");

      let color: number | undefined;
      if (colorRaw !== null) {
        const parsed = parseColor(colorRaw);
        if (parsed === null) {
          await interaction.reply({
            embeds: [embedErr("Ошибка цвета", "HEX из шести символов, например `CC0000`.")],
            ephemeral: true,
          });
          return;
        }
        color = parsed;
      }

      const updated = await role.edit({
        name,
        ...(color !== undefined ? { colors: { primaryColor: color } } : {}),
        hoist: hoist ?? undefined,
        mentionable: mentionable ?? undefined,
        reason: `ИИ Управление: правка ${interaction.user.tag}`,
      });

      await interaction.reply({
        embeds: [
          embedOk(
            "Правка внесена",
            `**${updated.name}** · ${updated.id}\nПозиция: **${updated.position}**`,
          ),
        ],
      });
      return;
    }

    if (sub === "delete") {
      const opt = interaction.options.getRole("role", true);
      if (opt.id === guild.id) {
        await interaction.reply({
          embeds: [embedErr("Запрещено", "@everyone нельзя удалить.")],
          ephemeral: true,
        });
        return;
      }
      const role = resolveRole(guild, opt.id);
      if (!role) {
        await interaction.reply({
          embeds: [embedErr("Роль не найдена", "Повторите команду.")],
          ephemeral: true,
        });
        return;
      }
      if (!botCanManageRole(guild, role.id)) {
        await interaction.reply({ embeds: [hierarchyBlocked()], ephemeral: true });
        return;
      }

      const label = role.name;
      await role.delete(`ИИ Управление: удаление ${interaction.user.tag}`);
      await interaction.reply({
        embeds: [embedOk("Роль расформирована", `Снято с учёта: **${label}**`)],
      });
      return;
    }

    if (sub === "give") {
      const user = interaction.options.getUser("user", true);
      const opt = interaction.options.getRole("role", true);
      if (opt.id === guild.id) {
        await interaction.reply({
          embeds: [embedErr("Запрещено", "Нельзя выдать @everyone.")],
          ephemeral: true,
        });
        return;
      }
      const role = resolveRole(guild, opt.id);
      if (!role) {
        await interaction.reply({
          embeds: [embedErr("Роль не найдена", "Повторите команду.")],
          ephemeral: true,
        });
        return;
      }
      if (!botCanManageRole(guild, role.id)) {
        await interaction.reply({ embeds: [hierarchyBlocked()], ephemeral: true });
        return;
      }

      const member = await guild.members.fetch(user.id);
      await member.roles.add(role, `ИИ Управление: выдача ${interaction.user.tag}`);
      await interaction.reply({
        embeds: [
          embedOk(
            "Роль присвоена",
            `${user} получил(а) **${role.name}**.`,
          ),
        ],
      });
      return;
    }

    if (sub === "take") {
      const user = interaction.options.getUser("user", true);
      const opt = interaction.options.getRole("role", true);
      if (opt.id === guild.id) {
        await interaction.reply({
          embeds: [embedErr("Запрещено", "Нельзя снять @everyone.")],
          ephemeral: true,
        });
        return;
      }
      const role = resolveRole(guild, opt.id);
      if (!role) {
        await interaction.reply({
          embeds: [embedErr("Роль не найдена", "Повторите команду.")],
          ephemeral: true,
        });
        return;
      }
      if (!botCanManageRole(guild, role.id)) {
        await interaction.reply({ embeds: [hierarchyBlocked()], ephemeral: true });
        return;
      }

      const member = await guild.members.fetch(user.id);
      await member.roles.remove(role, `ИИ Управление: снятие ${interaction.user.tag}`);
      await interaction.reply({
        embeds: [
          embedOk(
            "Роль изъята",
            `У ${user} снята **${role.name}**.`,
          ),
        ],
      });
      return;
    }

    if (sub === "clone") {
      const opt = interaction.options.getRole("source", true);
      const name = interaction.options.getString("name", true);
      if (opt.id === guild.id) {
        await interaction.reply({
          embeds: [embedErr("Запрещено", "Нельзя клонировать @everyone.")],
          ephemeral: true,
        });
        return;
      }
      const source = resolveRole(guild, opt.id);
      if (!source) {
        await interaction.reply({
          embeds: [embedErr("Роль не найдена", "Повторите команду.")],
          ephemeral: true,
        });
        return;
      }
      if (!botCanManageRole(guild, source.id)) {
        await interaction.reply({ embeds: [hierarchyBlocked()], ephemeral: true });
        return;
      }

      const created = await guild.roles.create({
        name,
        colors: {
          primaryColor: source.colors.primaryColor,
          ...(source.colors.secondaryColor != null
            ? { secondaryColor: source.colors.secondaryColor }
            : {}),
          ...(source.colors.tertiaryColor != null
            ? { tertiaryColor: source.colors.tertiaryColor }
            : {}),
        },
        hoist: source.hoist,
        mentionable: source.mentionable,
        permissions: source.permissions.bitfield,
        reason: `ИИ Управление: клон ${source.name} → ${interaction.user.tag}`,
      });

      await interaction.reply({
        embeds: [
          embedOk(
            "Роль клонирована",
            `**${created.name}** · ${created.id}\nНаследованы права и оформление от **${source.name}**.`,
          ),
        ],
      });
      return;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await interaction.reply({
      embeds: [embedErr("Сбой исполнения", msg)],
      ephemeral: true,
    });
  }
}
