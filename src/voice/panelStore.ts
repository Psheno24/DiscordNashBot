import { createJsonStore } from "../storage/jsonStore.js";

interface Store {
  /** channelId → messageId последней панели */
  messages: Record<string, string>;
}

const voicePanelJson = createJsonStore<Store>({
  fileName: "voice-ladder-panel.json",
  empty: () => ({ messages: {} }),
});

export function getVoiceLadderPanelMessageId(channelId: string): string | undefined {
  return voicePanelJson.read().messages[channelId];
}

export function setVoiceLadderPanelMessageId(channelId: string, messageId: string) {
  const s = voicePanelJson.read();
  s.messages[channelId] = messageId;
  voicePanelJson.write(s);
}
