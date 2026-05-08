import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { discordToken } from "./config.js";
import { registerMemberJoin } from "./listeners/memberJoin.js";
import {
  ensureNeuroPanel,
  handleNeuroButton,
  handleNeuroSettingsButton,
  handleNeuroSettingsSelect,
} from "./neurocontrol/panel.js";
import { registerVoiceLadder } from "./voice/voiceLadder.js";
import { ensureEconomyFeedPanel, ensureEconomyTerminalPanel, handleEconomyButton, handleEconomyModal } from "./economy/panel.js";
import { ensureBetsHealth, handleBetButton, handleBetModal, handleNeuroAdminBetFlow, handleNeuroAdminButton } from "./bets/bets.js";

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
  await ensureEconomyTerminalPanel(c);
  await ensureEconomyFeedPanel(c);
  await ensureBetsHealth(c);
});

registerMemberJoin(client);
registerVoiceLadder(client);

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      const handled =
        (await handleNeuroButton(interaction)) ||
        (await handleNeuroSettingsButton(interaction)) ||
        (await handleEconomyButton(interaction)) ||
        (await handleNeuroAdminButton(interaction)) ||
        (await handleNeuroAdminBetFlow(interaction)) ||
        (await handleBetButton(interaction));
      if (!handled) return;
      return;
    }

    if (interaction.isChannelSelectMenu()) {
      const handled = await handleNeuroSettingsSelect(interaction);
      if (!handled) return;
      return;
    }

    if (interaction.isModalSubmit()) {
      const handled = (await handleBetModal(interaction)) || (await handleEconomyModal(interaction));
      if (!handled) return;
      return;
    }

    return;
  } catch (e) {
    console.error("ИИ Управление: кнопка панели:", e);
  }
});

client.login(discordToken());
