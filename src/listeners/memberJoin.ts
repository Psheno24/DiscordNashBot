import { Events, type Client, type GuildMember, type User } from "discord.js";
import { welcomeChannelId } from "../config.js";
import { randomJoinCopy, randomLeaveCopy } from "../copy/ussrMemberActivity.js";
import { embedInfo, embedWarn } from "../theme.js";
import { resolveFirstLadderRoleId, syncVoiceLadderForMember } from "../voice/voiceLadder.js";

const NICK_MAX = 32;
const PREFIX = "Товарищ (";

/** Ник в формате «Товарищ (ник)», не длиннее лимита Discord. Только при первом входе. */
export function buildTovarischNickname(user: User): string {
  const raw = (user.globalName ?? user.username).trim() || "безымянный";
  const suffix = ")";
  let inner = raw;
  let nick = `${PREFIX}${inner}${suffix}`;
  while (nick.length > NICK_MAX && inner.length > 0) {
    inner = inner.slice(0, -1);
    nick = `${PREFIX}${inner}${suffix}`;
  }
  if (nick.length > NICK_MAX) {
    nick = nick.slice(0, NICK_MAX);
  }
  return nick;
}

export function registerMemberJoin(client: Client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;
    if (member.id === member.guild.ownerId) return;

    try {
      const roleId = await resolveFirstLadderRoleId(member.guild);
      if (roleId) {
        await member.roles.add(roleId, "ИИ Управление: роль при вступлении");
      } else {
        console.warn(
          "ИИ Управление: не найдена первая ступень лестницы — проверьте config/voice-ladder.json и имя роли на сервере.",
        );
      }
    } catch (e) {
      console.warn("ИИ Управление: не удалось выдать роль при вступлении:", member.id, e);
    }

    try {
      await syncVoiceLadderForMember(member);
    } catch {
      /* voice-ladder.json может отсутствовать */
    }

    try {
      const nick = buildTovarischNickname(member.user);
      await member.setNickname(nick, "ИИ Управление: униформа при вступлении");
    } catch (e) {
      console.warn("ИИ Управление: не удалось сменить ник:", member.id, e);
    }

    const activityId = welcomeChannelId();
    if (activityId) {
      try {
        const ch = await member.guild.channels.fetch(activityId).catch(() => null);
        if (ch?.isTextBased() && ch.isSendable()) {
          const { title, description } = randomJoinCopy(member.user.tag, member.guild.name);
          await ch.send({
            content: member.toString(),
            embeds: [embedInfo(title, description)],
            allowedMentions: { users: [member.id] },
          });
        }
      } catch (e) {
        console.warn("ИИ Управление: не удалось отправить приветствие в канал:", activityId, e);
      }
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    if (member.user?.bot) return;

    const activityId = welcomeChannelId();
    if (!activityId) return;

    const tag = member.user?.tag ?? member.user?.username ?? member.id;

    try {
      const ch = await member.guild.channels.fetch(activityId).catch(() => null);
      if (ch?.isTextBased() && ch.isSendable()) {
        const { title, description } = randomLeaveCopy(tag, member.guild.name);
        await ch.send({
          content: `<@${member.id}>`,
          embeds: [embedWarn(title, description)],
          allowedMentions: { users: [member.id] },
        });
      }
    } catch (e) {
      console.warn("ИИ Управление: не удалось отправить запись о выбытии в канал:", activityId, e);
    }
  });
}
