import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeJsonAtomicSync } from "../storage/atomicJson.js";

interface Store {
  /** channelId → messageId последней панели */
  messages: Record<string, string>;
}

const storePath = () => {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "neurocontrol-panel.json");
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

export function getPanelMessageId(channelId: string): string | undefined {
  return readStore().messages[channelId];
}

export function setPanelMessageId(channelId: string, messageId: string) {
  const s = readStore();
  s.messages[channelId] = messageId;
  writeJsonAtomicSync(storePath(), s);
}
