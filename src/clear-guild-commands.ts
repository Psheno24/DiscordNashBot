/**
 * Разово: убрать все слэш-команды приложения с гильдии (после перехода на бота без команд).
 * Нужны в .env: DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
 */
import "dotenv/config";
import { REST, Routes } from "discord.js";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const rest = new REST({ version: "10" }).setToken(req("DISCORD_TOKEN"));

await rest.put(Routes.applicationGuildCommands(req("DISCORD_CLIENT_ID"), req("DISCORD_GUILD_ID")), {
  body: [],
});

console.log("Слэш-команды на гильдии сняты.");
