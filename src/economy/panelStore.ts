import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Store {
  /** channelId → messageId панели терминала */
  terminalMessages: Record<string, string>;
  /** channelId → messageId панели ленты */
  feedMessages: Record<string, string>;
}

const storePath = () => {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "economy-panels.json");
};

function readStore(): Store {
  const p = storePath();
  if (!existsSync(p)) return { terminalMessages: {}, feedMessages: {} };
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as Store;
  } catch {
    return { terminalMessages: {}, feedMessages: {} };
  }
}

function writeStore(s: Store) {
  writeFileSync(storePath(), JSON.stringify(s, null, 2), "utf-8");
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

