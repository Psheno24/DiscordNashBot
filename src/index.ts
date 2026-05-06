import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { discordToken } from "./config.js";
import { registerMemberJoin } from "./listeners/memberJoin.js";
import { ensureNeuroPanel, handleNeuroButton } from "./neurocontrol/panel.js";
import { registerVoiceLadder } from "./voice/voiceLadder.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.GuildMember],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`ИИ Управление на связи: ${c.user.tag}`);
  await ensureNeuroPanel(c);
});

registerMemberJoin(client);
registerVoiceLadder(client);

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  try {
    await handleNeuroButton(interaction);
  } catch (e) {
    console.error("ИИ Управление: кнопка панели:", e);
  }
});

client.login(discordToken());
