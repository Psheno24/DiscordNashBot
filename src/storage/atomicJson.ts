import { renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function atomicTempPath(targetPath: string): string {
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return join(dirname(targetPath), `.${stamp}.tmp`);
}

export function writeJsonAtomicSync(path: string, value: unknown): void {
  const payload = JSON.stringify(value, null, 2);
  const tempPath = atomicTempPath(path);
  writeFileSync(tempPath, payload, "utf-8");
  try {
    renameSync(tempPath, path);
  } catch {
    // Windows can block rename-over-existing; fallback keeps latest data.
    rmSync(path, { force: true });
    renameSync(tempPath, path);
  }
}
