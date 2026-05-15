import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export interface PendingTelegramCode {
  guildId: string;
  discordUserId: string;
  expiresAtMs: number;
}

export interface TelegramLink {
  guildId: string;
  discordUserId: string;
  linkedAtMs: number;
}

/** Последний выданный в Discord код привязки (для отображения в эмбеде и «истёк»). */
export interface LastIssuedTelegramCode {
  code: string;
  expiresAtMs: number;
  issuedAtMs: number;
}

export interface NotifyLatch {
  /** Последний `lastWorkAt+cd` (граница), для которой уже отправили «смена готова». */
  lastWorkBoundaryNotifiedMs?: number;
  /** Последний `lastTrainAt+TRAIN_CD`, для которой уже отправили «навык готов». */
  lastTrainBoundaryNotifiedMs?: number;
}

/** UI в личке Telegram: одна панель + отдельные push-уведомления. */
export interface TelegramUiState {
  /** Сообщение с inline-меню (редактируется как в Discord). */
  panelMessageId?: number;
  /** Последнее уведомление «смена готова» (заменяется новым). */
  notifyWorkMessageId?: number;
  /** Последнее уведомление «навык готов» (заменяется новым). */
  notifyTrainMessageId?: number;
}

interface StoreShape {
  pendingCodes: Record<string, PendingTelegramCode>;
  linksByTelegramId: Record<string, TelegramLink>;
  /** `guildId:discordUserId` → telegram user id */
  linksByDiscordKey: Record<string, string>;
  lastIssuedCodeByDiscord: Record<string, LastIssuedTelegramCode>;
  notifyLatchByTelegramId: Record<string, NotifyLatch>;
  uiByTelegramId: Record<string, TelegramUiState>;
}

export function discordPairKey(guildId: string, discordUserId: string): string {
  return `${guildId}:${discordUserId}`;
}

function storePath(): string {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "telegram-bridge.json");
}

function normalizeStore(raw: Partial<StoreShape>): StoreShape {
  const pendingCodes = raw.pendingCodes && typeof raw.pendingCodes === "object" ? raw.pendingCodes : {};
  const linksByTelegramId =
    raw.linksByTelegramId && typeof raw.linksByTelegramId === "object" ? raw.linksByTelegramId : {};
  const linksByDiscordKey: Record<string, string> =
    raw.linksByDiscordKey && typeof raw.linksByDiscordKey === "object" ? { ...raw.linksByDiscordKey } : {};
  for (const [tid, link] of Object.entries(linksByTelegramId)) {
    const k = discordPairKey(link.guildId, link.discordUserId);
    linksByDiscordKey[k] = tid;
  }
  const lastIssuedCodeByDiscord =
    raw.lastIssuedCodeByDiscord && typeof raw.lastIssuedCodeByDiscord === "object"
      ? raw.lastIssuedCodeByDiscord
      : {};
  const notifyLatchByTelegramId =
    raw.notifyLatchByTelegramId && typeof raw.notifyLatchByTelegramId === "object"
      ? raw.notifyLatchByTelegramId
      : {};
  const uiByTelegramId =
    raw.uiByTelegramId && typeof raw.uiByTelegramId === "object" ? raw.uiByTelegramId : {};
  return {
    pendingCodes,
    linksByTelegramId,
    linksByDiscordKey,
    lastIssuedCodeByDiscord,
    notifyLatchByTelegramId,
    uiByTelegramId,
  };
}

function readStore(): StoreShape {
  const p = storePath();
  if (!existsSync(p)) {
    return {
      pendingCodes: {},
      linksByTelegramId: {},
      linksByDiscordKey: {},
      lastIssuedCodeByDiscord: {},
      notifyLatchByTelegramId: {},
      uiByTelegramId: {},
    };
  }
  try {
    const raw = JSON.parse(readFileSync(p, "utf-8")) as Partial<StoreShape>;
    return normalizeStore(raw);
  } catch {
    return {
      pendingCodes: {},
      linksByTelegramId: {},
      linksByDiscordKey: {},
      lastIssuedCodeByDiscord: {},
      notifyLatchByTelegramId: {},
      uiByTelegramId: {},
    };
  }
}

function writeStore(s: StoreShape) {
  writeFileSync(storePath(), JSON.stringify(s, null, 2), "utf-8");
}

function randomCode(): string {
  return randomBytes(5).toString("base64url").slice(0, 8).toUpperCase();
}

/**
 * Создаёт новый код: снимает старый pending для этого Discord-пользователя, пишет в `data/telegram-bridge.json`.
 */
export function createTelegramLinkCode(guildId: string, discordUserId: string, ttlMs: number): string {
  const s = readStore();
  const key = discordPairKey(guildId, discordUserId);
  const prev = s.lastIssuedCodeByDiscord[key];
  if (prev?.code) delete s.pendingCodes[prev.code];
  const code = randomCode();
  const now = Date.now();
  const expiresAtMs = now + ttlMs;
  s.pendingCodes[code] = { guildId, discordUserId, expiresAtMs };
  s.lastIssuedCodeByDiscord[key] = { code, expiresAtMs, issuedAtMs: now };
  writeStore(s);
  return code;
}

export function getLastIssuedTelegramCode(
  guildId: string,
  discordUserId: string,
): LastIssuedTelegramCode | undefined {
  return readStore().lastIssuedCodeByDiscord[discordPairKey(guildId, discordUserId)];
}

export function getLinkedTelegramIdForDiscord(guildId: string, discordUserId: string): string | undefined {
  return readStore().linksByDiscordKey[discordPairKey(guildId, discordUserId)];
}

export function listLinkedTelegramUserIds(): string[] {
  return Object.keys(readStore().linksByTelegramId);
}

export function peekTelegramLinkCode(code: string): PendingTelegramCode | undefined {
  const norm = code.trim().toUpperCase();
  const row = readStore().pendingCodes[norm];
  if (!row) return undefined;
  if (Date.now() > row.expiresAtMs) {
    const s = readStore();
    delete s.pendingCodes[norm];
    writeStore(s);
    return undefined;
  }
  return row;
}

export function removeTelegramLinkCode(code: string): void {
  const norm = code.trim().toUpperCase();
  const s = readStore();
  delete s.pendingCodes[norm];
  writeStore(s);
}

export function setTelegramLink(telegramUserId: string, link: TelegramLink): void {
  const s = readStore();
  const tid = String(telegramUserId);
  for (const [t, l] of Object.entries(s.linksByTelegramId)) {
    if (l.guildId === link.guildId && l.discordUserId === link.discordUserId) delete s.linksByTelegramId[t];
  }
  s.linksByTelegramId[tid] = link;
  if (!s.linksByDiscordKey) s.linksByDiscordKey = {};
  s.linksByDiscordKey[discordPairKey(link.guildId, link.discordUserId)] = tid;
  writeStore(s);
}

export function getTelegramLink(telegramUserId: string): TelegramLink | undefined {
  return readStore().linksByTelegramId[String(telegramUserId)];
}

export function getNotifyLatch(telegramUserId: string): NotifyLatch {
  return readStore().notifyLatchByTelegramId[String(telegramUserId)] ?? {};
}

export function patchNotifyLatch(telegramUserId: string, patch: Partial<NotifyLatch>): void {
  const s = readStore();
  const id = String(telegramUserId);
  const cur = s.notifyLatchByTelegramId[id] ?? {};
  s.notifyLatchByTelegramId[id] = { ...cur, ...patch };
  writeStore(s);
}

export function getTelegramUiState(telegramUserId: string): TelegramUiState {
  return readStore().uiByTelegramId[String(telegramUserId)] ?? {};
}

export function patchTelegramUiState(telegramUserId: string, patch: Partial<TelegramUiState>): void {
  const s = readStore();
  const id = String(telegramUserId);
  const cur = s.uiByTelegramId[id] ?? {};
  s.uiByTelegramId[id] = { ...cur, ...patch };
  writeStore(s);
}
