import { listEconomyUsers } from "./userStore.js";

export interface GuildEconomyRanks {
  totalPlayers: number;
  topPsUserId: string | null;
  topRubUserId: string | null;
  psPlaceByUserId: Map<string, number>;
  rubPlaceByUserId: Map<string, number>;
}

export function computeGuildEconomyRanks(guildId: string): GuildEconomyRanks {
  const list = listEconomyUsers(guildId);
  const byPs = [...list].sort((a, b) => b.user.psTotal - a.user.psTotal);
  const byRub = [...list].sort((a, b) => b.user.rubles - a.user.rubles);

  const psPlaceByUserId = new Map<string, number>();
  const rubPlaceByUserId = new Map<string, number>();

  byPs.forEach(({ userId }, i) => psPlaceByUserId.set(userId, i + 1));
  byRub.forEach(({ userId }, i) => rubPlaceByUserId.set(userId, i + 1));

  return {
    totalPlayers: list.length,
    topPsUserId: byPs[0]?.userId ?? null,
    topRubUserId: byRub[0]?.userId ?? null,
    psPlaceByUserId,
    rubPlaceByUserId,
  };
}

/** «3-е место» / «1-е место» */
export function formatServerPlace(place: number, total: number): string {
  if (total <= 0) return "—";
  if (place === 1) return "1-е место";
  if (place === 2) return "2-е место";
  if (place === 3) return "3-е место";
  return `${place}-е место`;
}
