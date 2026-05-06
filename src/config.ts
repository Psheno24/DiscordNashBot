import "dotenv/config";

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
export const welcomeChannelId = () => opt("DISCORD_WELCOME_CHANNEL_ID");

/** ID канала «Нейроком контроль»: панель с кнопкой «Роли». Необязательно. */
export const neuroControlChannelId = () => opt("DISCORD_NEUROCONTROL_CHANNEL_ID");
