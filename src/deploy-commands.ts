import { REST, Routes } from "discord.js";
import { discordClientId, discordGuildId, discordToken } from "./config.js";
import { roleSlash } from "./commands/role.js";
import { nadzorSlash } from "./commands/nadzor.js";

const rest = new REST({ version: "10" }).setToken(discordToken());

const body = [roleSlash.toJSON(), nadzorSlash.toJSON()];

await rest.put(Routes.applicationGuildCommands(discordClientId(), discordGuildId()), {
  body,
});

console.log("Слэш-команды зарегистрированы на гильдии.");
