import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NeurocontrolFile } from "./types.js";

export function loadNeurocontrol(): NeurocontrolFile {
  const path = join(process.cwd(), "config", "neurocontrol.json");
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw) as NeurocontrolFile;
  if (!data.panel?.title || !Array.isArray(data.roles)) {
    throw new Error("neurocontrol.json: нужны panel.title и массив roles");
  }
  return data;
}
