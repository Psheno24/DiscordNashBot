import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { VoiceLadderFile } from "./types.js";

export function loadVoiceLadder(): VoiceLadderFile {
  const path = join(process.cwd(), "config", "voice-ladder.json");
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw) as VoiceLadderFile;
  if (!Array.isArray(data.ladder) || data.ladder.length === 0) {
    throw new Error("voice-ladder.json: нужен непустой массив ladder");
  }
  for (let i = 1; i < data.ladder.length; i++) {
    if (data.ladder[i]!.voiceMinutesTotal < data.ladder[i - 1]!.voiceMinutesTotal) {
      throw new Error("voice-ladder.json: пороги voiceMinutesTotal должны быть неубывающими");
    }
  }
  return data;
}
