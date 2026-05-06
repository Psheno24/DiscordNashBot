import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const discordToken = () => req("DISCORD_TOKEN");
export const discordClientId = () => req("DISCORD_CLIENT_ID");
export const discordGuildId = () => req("DISCORD_GUILD_ID");

function opt(name: string): string | undefined {
  const v = process.env[name];
  if (v == null || v.trim() === "") return undefined;
  return v.trim();
}

/** ID текстового канала: учёт вступлений и выбытий (см. listeners/memberJoin). Необязательно. */
export const welcomeChannelId = () => opt("DISCORD_WELCOME_CHANNEL_ID");
