import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Interaction,
} from "discord.js";
import { discordToken } from "./config.js";
import { handleRoleCommand } from "./commands/role.js";
import { handleNadzorCommand } from "./commands/nadzor.js";
import { handleButtonInteraction } from "./interactions/buttons.js";
import { registerMemberJoin } from "./listeners/memberJoin.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.GuildMember],
});

client.once(Events.ClientReady, (c) => {
  console.log(`ИИ Управление на связи: ${c.user.tag}`);
});

registerMemberJoin(client);

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (interaction.isButton()) {
    const handled = await handleButtonInteraction(interaction);
    if (handled) return;
  }

  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "role") {
    await handleRoleCommand(interaction);
    return;
  }
  if (interaction.commandName === "nadzor") {
    await handleNadzorCommand(interaction);
  }
});

client.login(discordToken());
