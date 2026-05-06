import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RolesCatalog } from "./types.js";

export function loadRolesCatalog(): RolesCatalog {
  const path = join(process.cwd(), "config", "roles-catalog.json");
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as RolesCatalog;
}
