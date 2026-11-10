import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeJsonAtomicSync } from "./atomicJson.js";

/** Каталог данных: `NASHBOT_DATA_DIR` или `./data`. */
export function dataRoot(): string {
  const fromEnv = process.env.NASHBOT_DATA_DIR?.trim();
  const dir = fromEnv && fromEnv.length > 0 ? fromEnv : join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export type JsonStoreOptions<T> = {
  fileName: string;
  empty: () => T;
};

/**
 * JSON-файл с in-memory кэшем (один процесс) и бэкапом при битом JSON.
 * Убирает гонку «два read с диска → два write» внутри одного процесса Node.
 */
export function createJsonStore<T extends object>(opts: JsonStoreOptions<T>) {
  let cache: T | null = null;

  const filePath = (): string => join(dataRoot(), opts.fileName);

  function loadFromDisk(): T {
    const p = filePath();
    if (!existsSync(p)) return opts.empty();
    try {
      return JSON.parse(readFileSync(p, "utf-8")) as T;
    } catch (e) {
      const bak = `${p}.corrupt.${Date.now()}.bak`;
      try {
        copyFileSync(p, bak);
        console.error(`[jsonStore] corrupt ${opts.fileName}, backup → ${bak}`, e);
      } catch (copyErr) {
        console.error(`[jsonStore] corrupt ${opts.fileName}, backup failed`, copyErr);
      }
      return opts.empty();
    }
  }

  function read(): T {
    if (!cache) cache = loadFromDisk();
    return cache;
  }

  function write(next: T): void {
    cache = next;
    writeJsonAtomicSync(filePath(), next);
  }

  /** Сбросить кэш (тесты / смена DATA_DIR). */
  function resetCache(): void {
    cache = null;
  }

  return { read, write, resetCache, filePath };
}
