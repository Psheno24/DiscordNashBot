import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAX_POOL = 250;

type PoolShape = { released: string[] };

function poolPath(): string {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "economy-sim-pool.json");
}

function readPool(): PoolShape {
  const p = poolPath();
  if (!existsSync(p)) return { released: [] };
  try {
    const raw = JSON.parse(readFileSync(p, "utf-8")) as PoolShape;
    if (!Array.isArray(raw.released)) return { released: [] };
    return { released: raw.released.filter((x) => typeof x === "string" && /^\d{5}$/.test(x)) };
  } catch {
    return { released: [] };
  }
}

function writePool(s: PoolShape) {
  writeFileSync(poolPath(), JSON.stringify(s, null, 2), "utf-8");
}

/** Старый номер симки возвращается в «продажу» (пул для гачи красивых номеров). */
export function releaseSimNumberToPool(num: string): void {
  if (!/^\d{5}$/.test(num)) return;
  const s = readPool();
  if (!s.released.includes(num)) s.released.push(num);
  while (s.released.length > MAX_POOL) s.released.shift();
  writePool(s);
}

/** Случайный номер из пула или `null`, если пул пуст. */
export function drawSimNumberFromPool(): string | null {
  const s = readPool();
  if (s.released.length === 0) return null;
  const i = Math.floor(Math.random() * s.released.length);
  const [num] = s.released.splice(i, 1);
  writePool(s);
  return num ?? null;
}
