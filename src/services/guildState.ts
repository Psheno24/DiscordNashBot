import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface GuildInstallState {
  roleIds: Record<string, string>;
  channelIds: {
    adminPanel?: string;
    publicPanel?: string;
  };
  panelMessageIds: {
    adminPanel?: string;
    publicPanel?: string;
  };
}

function pathFor(guildId: string) {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, `${guildId}.json`);
}

export function loadGuildState(guildId: string): GuildInstallState {
  const p = pathFor(guildId);
  if (!existsSync(p)) {
    return { roleIds: {}, channelIds: {}, panelMessageIds: {} };
  }
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as GuildInstallState;
  } catch {
    return { roleIds: {}, channelIds: {}, panelMessageIds: {} };
  }
}

export function saveGuildState(guildId: string, state: GuildInstallState) {
  writeFileSync(pathFor(guildId), JSON.stringify(state, null, 2), "utf-8");
}
