import { createJsonStore } from "../storage/jsonStore.js";

interface Store {
  /** channelId → messageId панели терминала */
  terminalMessages: Record<string, string>;
  /** channelId → messageId панели ленты */
  feedMessages: Record<string, string>;
}

const panelsJson = createJsonStore<Store>({
  fileName: "economy-panels.json",
  empty: () => ({ terminalMessages: {}, feedMessages: {} }),
});

function readStore(): Store {
  return panelsJson.read();
}

function writeStore(s: Store) {
  panelsJson.write(s);
}

export function getEconomyTerminalPanelMessageId(channelId: string): string | undefined {
  return readStore().terminalMessages[channelId];
}

export function setEconomyTerminalPanelMessageId(channelId: string, messageId: string) {
  const s = readStore();
  s.terminalMessages[channelId] = messageId;
  writeStore(s);
}

export function clearEconomyTerminalPanelMessageId(channelId: string) {
  const s = readStore();
  delete s.terminalMessages[channelId];
  writeStore(s);
}

export function getEconomyFeedPanelMessageId(channelId: string): string | undefined {
  return readStore().feedMessages[channelId];
}

export function setEconomyFeedPanelMessageId(channelId: string, messageId: string) {
  const s = readStore();
  s.feedMessages[channelId] = messageId;
  writeStore(s);
}

