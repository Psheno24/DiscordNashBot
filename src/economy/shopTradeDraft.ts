export type ShopTradeKind = "phone" | "car" | "apt";

export type ShopTradeDraft = {
  kind: ShopTradeKind;
  catalogId: string;
  selected: string[];
};

const drafts = new Map<string, ShopTradeDraft>();

function key(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function beginShopTradeDraft(
  guildId: string,
  userId: string,
  kind: ShopTradeKind,
  catalogId: string,
  selected: string[] = [],
): ShopTradeDraft {
  const d: ShopTradeDraft = { kind, catalogId, selected: uniqueUids(selected) };
  drafts.set(key(guildId, userId), d);
  return d;
}

export function selectedShopTradeUids(
  guildId: string,
  userId: string,
  kind: ShopTradeKind,
  catalogId: string,
): string[] {
  const d = drafts.get(key(guildId, userId));
  if (!d || d.kind !== kind || d.catalogId !== catalogId) return [];
  return d.selected;
}

export function toggleShopTradeUid(
  guildId: string,
  userId: string,
  kind: ShopTradeKind,
  catalogId: string,
  uid: string,
): string[] {
  const d = drafts.get(key(guildId, userId));
  if (!d || d.kind !== kind || d.catalogId !== catalogId) {
    beginShopTradeDraft(guildId, userId, kind, catalogId, [uid]);
    return [uid];
  }
  const set = new Set(d.selected);
  if (set.has(uid)) set.delete(uid);
  else set.add(uid);
  d.selected = [...set];
  return d.selected;
}

export function clearShopTradeDraft(guildId: string, userId: string): void {
  drafts.delete(key(guildId, userId));
}

function uniqueUids(uids: string[]): string[] {
  return [...new Set(uids.filter((u) => u.length > 0))];
}
