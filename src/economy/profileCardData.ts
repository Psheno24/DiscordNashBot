import { getApartmentDef, getPetDef, getPhoneDef } from "./economyCatalog.js";
import { economyCarDisplayLine } from "./economyLicensePlate.js";
import { economyJobTitle } from "./jobTitles.js";
import { computeGuildEconomyRanks, formatServerPlace, type GuildEconomyRanks } from "./profileCardRanks.js";
import { resolveProfileCardStyle, type ProfileFrameColorId } from "./profileThemes.js";
import type { EconomyUser } from "./userStore.js";
import type { GuildMember } from "discord.js";

export interface ProfileCardContent {
  displayName: string;
  frameColorId: ProfileFrameColorId;
  accent: string;
  background: string;
  isTopPs: boolean;
  isTopRub: boolean;
  lines: string[];
}

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function truncateLine(s: string, max = 52): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function apartmentLabel(aptId: string | undefined): string {
  return getApartmentDef(aptId)?.label ?? "—";
}

function housingLine(u: EconomyUser): string {
  const hk = u.housingKind ?? "none";
  const parts: string[] = [];
  if (hk === "rent") parts.push("Аренда");
  else if (hk === "owned") parts.push(apartmentLabel(u.ownedApartmentId));
  if (u.housingForeignKind === "owned") parts.push(apartmentLabel(u.ownedForeignApartmentId));
  return `Жильё: ${parts.length > 0 ? parts.join(" · ") : "нет"}`;
}

function phoneLine(u: EconomyUser): string {
  if (!u.hasPhone) return "Телефон: нет";
  const pl = getPhoneDef(u.phoneModelId)?.label ?? "есть";
  if (!u.courierSimNumber) return `Телефон: ${pl} (сим нет)`;
  return `Телефон: ${pl} · сим ${u.courierSimNumber}`;
}

export function buildProfileCardContent(
  member: GuildMember,
  u: EconomyUser,
  ranks?: GuildEconomyRanks,
  previewFrameColorId?: ProfileFrameColorId,
): ProfileCardContent {
  const guildId = member.guild.id;
  const userId = member.id;
  const r = ranks ?? computeGuildEconomyRanks(guildId);
  const style = resolveProfileCardStyle(u.profileCardColor, previewFrameColorId);

  const psPlace = r.psPlaceByUserId.get(userId) ?? r.totalPlayers;
  const rubPlace = r.rubPlaceByUserId.get(userId) ?? r.totalPlayers;

  const jobName = u.jobId ? economyJobTitle(u.jobId) : "не выбрана";
  const pet = u.ownedPetId ? getPetDef(u.ownedPetId) : undefined;

  const lines = [
    `Престиж: ${fmt(u.prestigePoints ?? 0)}`,
    `Быт: ${fmt(u.domesticPoints ?? 0)}`,
    "",
    truncateLine(phoneLine(u)),
    truncateLine(economyCarDisplayLine(u, { markdown: false })),
    truncateLine(housingLine(u)),
    truncateLine(`Питомец: ${pet?.label ?? "нет"}`),
    "",
    truncateLine(`Работа: ${jobName}`),
    `СР: ${fmt(u.psTotal)} (${formatServerPlace(psPlace, r.totalPlayers)})`,
    `₽: ${fmt(u.rubles)} (${formatServerPlace(rubPlace, r.totalPlayers)})`,
  ];

  return {
    displayName: truncateLine(member.displayName, 28),
    frameColorId: style.frameColorId,
    accent: style.accent,
    background: style.background,
    isTopPs: r.topPsUserId === userId,
    isTopRub: r.topRubUserId === userId,
    lines,
  };
}
