import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { discordToken } from "./config.js";
import { registerMemberJoin } from "./listeners/memberJoin.js";
import { ensureNeuroPanel, handleNeuroButton } from "./neurocontrol/panel.js";
import {
  handleNeuroChannelsSelect,
  handleNeuroSettingsTreeButton,
  handleNeuroTaxModalSubmit,
} from "./neurocontrol/settingsTree.js";
import { registerVoiceLadder } from "./voice/voiceLadder.js";
import {
  ensureEconomyFeedPanel,
  ensureEconomyTerminalPanel,
  handleEconomyButton,
  handleEconomyModal,
} from "./economy/panel.js";
import { scheduleEconomyMskMidnightTick } from "./economy/tier3Daily.js";
import { ensureBetsHealth, handleBetButton, handleBetModal, handleNeuroAdminBetFlow, handleNeuroAdminButton } from "./bets/bets.js";
import {
  handleLeavePreviewCommand,
  handleWelcomePreviewCommand,
  leavePreviewCommandName,
  registerMemberActivityPreviewCommands,
  welcomePreviewCommandName,
} from "./welcomePreview.js";

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
  await registerMemberActivityPreviewCommands(c);
  await ensureNeuroPanel(c);
  await ensureEconomyTerminalPanel(c);
  await ensureEconomyFeedPanel(c);
  await ensureBetsHealth(c);
  scheduleEconomyMskMidnightTick(c, async () => {
    await ensureEconomyFeedPanel(c);
  });
});

registerMemberJoin(client);
registerVoiceLadder(client);

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === welcomePreviewCommandName) {
        await handleWelcomePreviewCommand(interaction);
        return;
      }
      if (interaction.commandName === leavePreviewCommandName) {
        await handleLeavePreviewCommand(interaction);
        return;
      }
    }

    if (interaction.isButton()) {
      const handled =
        (await handleNeuroButton(interaction)) ||
        (await handleNeuroSettingsTreeButton(interaction)) ||
        (await handleEconomyButton(interaction)) ||
        (await handleNeuroAdminButton(interaction)) ||
        (await handleNeuroAdminBetFlow(interaction)) ||
        (await handleBetButton(interaction));
      if (!handled) return;
      return;
    }

    if (interaction.isChannelSelectMenu()) {
      const chHandled = await handleNeuroChannelsSelect(interaction);
      if (chHandled) {
        await ensureNeuroPanel(interaction.client);
        await ensureEconomyTerminalPanel(interaction.client);
        await ensureEconomyFeedPanel(interaction.client);
      }
      if (!chHandled) return;
      return;
    }

    if (interaction.isModalSubmit()) {
      const handled =
        (await handleNeuroTaxModalSubmit(interaction)) ||
        (await handleBetModal(interaction)) ||
        (await handleEconomyModal(interaction));
      if (!handled) return;
      return;
    }

    return;
  } catch (e) {
    console.error("ИИ Управление: кнопка панели:", e);
  }
});

client.login(discordToken());
