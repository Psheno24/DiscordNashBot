import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Store {
  /** channelId → messageId последней панели */
  messages: Record<string, string>;
}

const storePath = () => {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "voice-ladder-panel.json");
};

function readStore(): Store {
  const p = storePath();
  if (!existsSync(p)) return { messages: {} };
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as Store;
  } catch {
    return { messages: {} };
  }
}

export function getVoiceLadderPanelMessageId(channelId: string): string | undefined {
  return readStore().messages[channelId];
}

export function setVoiceLadderPanelMessageId(channelId: string, messageId: string) {
  const s = readStore();
  s.messages[channelId] = messageId;
  writeFileSync(storePath(), JSON.stringify(s, null, 2), "utf-8");
}

