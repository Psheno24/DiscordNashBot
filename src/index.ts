import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { ensureMacroScheduleV2Migration, processAllGuildsMacroMonth } from "./economy/economyMacro.js";
import { discordToken } from "./config.js";
import { registerMemberJoin } from "./listeners/memberJoin.js";
import { setOnTreasuryMutated } from "./economy/taxTreasury.js";
import { ensureNeuroPanel, handleNeuroButton, refreshNeuroPanelGuild } from "./neurocontrol/panel.js";
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
  onEconomyTerminalPanelDeleted,
} from "./economy/panel.js";
import { scheduleLotteryDrawTick } from "./economy/lotteryDraw.js";
import { scheduleEconomyMskMidnightTick } from "./economy/tier3Daily.js";
import {
  ensureBetsHealth,
  handleBetButton,
  handleBetModal,
  handleMoneyOwnerSlashCommand,
  handleNeuroAdminBetFlow,
  handleNeuroAdminButton,
} from "./bets/bets.js";
import {
  giveMoneyCommandName,
  handleLeavePreviewCommand,
  handleWelcomePreviewCommand,
  leavePreviewCommandName,
  registerMemberActivityPreviewCommands,
  takeMoneyCommandName,
  welcomePreviewCommandName,
} from "./welcomePreview.js";
import { startTelegramSidecar } from "./telegram/bot.js";

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
  setOnTreasuryMutated((gid) => {
    void refreshNeuroPanelGuild(c, gid);
  });
  await ensureNeuroPanel(c);
  await ensureMacroScheduleV2Migration(c);
  await ensureEconomyTerminalPanel(c);
  await ensureEconomyFeedPanel(c);
  await ensureBetsHealth(c);
  scheduleEconomyMskMidnightTick(c, async () => {
    await processAllGuildsMacroMonth(c);
    await ensureEconomyTerminalPanel(c);
    await ensureEconomyFeedPanel(c);
  });
  scheduleLotteryDrawTick(c);
  setInterval(
    () => {
      void ensureEconomyTerminalPanel(c);
    },
    60 * 60 * 1000,
  );
  startTelegramSidecar(c);
});

client.on(Events.MessageDelete, async (msg) => {
  try {
    if (!msg.guildId || !msg.channelId) return;
    await onEconomyTerminalPanelDeleted(msg.client, msg.channelId, msg.id);
  } catch (e) {
    console.error("terminal panel restore:", e);
  }
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
      if (interaction.commandName === giveMoneyCommandName || interaction.commandName === takeMoneyCommandName) {
        await handleMoneyOwnerSlashCommand(interaction);
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
