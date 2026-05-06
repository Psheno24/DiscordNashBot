import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { discordToken } from "./config.js";
import { registerMemberJoin } from "./listeners/memberJoin.js";
import { registerVoiceLadder } from "./voice/voiceLadder.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.GuildMember],
});

client.once(Events.ClientReady, (c) => {
  console.log(`ИИ Управление на связи: ${c.user.tag}`);
});

registerMemberJoin(client);
registerVoiceLadder(client);

client.login(discordToken());
