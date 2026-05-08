import "dotenv/config";
import { getGuildConfig } from "./guildConfig/store.js";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const discordToken = () => req("DISCORD_TOKEN");

function opt(name: string): string | undefined {
  const v = process.env[name];
  if (v == null || v.trim() === "") return undefined;
  return v.trim();
}

/** ID текстового канала: учёт вступлений и выбытий. Необязательно. */
export const welcomeChannelId = (guildId?: string) =>
  (guildId ? getGuildConfig(guildId).welcomeChannelId : undefined) ?? opt("DISCORD_WELCOME_CHANNEL_ID");

/** ID канала «Нейроком контроль»: панель с кнопкой «Роли». Необязательно. */
export const neuroControlChannelId = (guildId?: string) =>
  (guildId ? getGuildConfig(guildId).neuroControlChannelId : undefined) ?? opt("DISCORD_NEUROCONTROL_CHANNEL_ID");

/** ID текстового канала: общая панель голосовой лестницы (кнопка «Моя лестница»). Необязательно. */
// Голосовая лестница теперь доступна внутри личного меню «Терминала страны».

/** ID текстового канала: «Терминал страны» (экономика, управление собой). Необязательно. */
export const economyTerminalChannelId = (guildId?: string) =>
  (guildId ? getGuildConfig(guildId).economyTerminalChannelId : undefined) ?? opt("DISCORD_ECONOMY_TERMINAL_CHANNEL_ID");

/** ID текстового канала: «Лента страны» (публичная активность + карточки событий). Необязательно. */
export const economyFeedChannelId = (guildId?: string) =>
  (guildId ? getGuildConfig(guildId).economyFeedChannelId : undefined) ?? opt("DISCORD_ECONOMY_FEED_CHANNEL_ID");
