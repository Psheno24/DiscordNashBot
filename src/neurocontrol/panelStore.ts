import { createJsonStore } from "../storage/jsonStore.js";

interface Store {
  /** channelId → messageId последней панели */
  messages: Record<string, string>;
}

const neuroPanelJson = createJsonStore<Store>({
  fileName: "neurocontrol-panel.json",
  empty: () => ({ messages: {} }),
});

export function getPanelMessageId(channelId: string): string | undefined {
  return neuroPanelJson.read().messages[channelId];
}

export function setPanelMessageId(channelId: string, messageId: string) {
  const s = neuroPanelJson.read();
  s.messages[channelId] = messageId;
  neuroPanelJson.write(s);
}
