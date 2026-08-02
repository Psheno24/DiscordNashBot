import { getApartmentDef, getPetDef, getPhoneDef } from "./economyCatalog.js";
import { economyCarDisplayLine } from "./economyLicensePlate.js";
import { formatSimNumberFromUser } from "./economySimNumber.js";
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

function apartmentLabel(aptId: string | undefined): string {
  return getApartmentDef(aptId)?.label ?? "—";
}

function housingOwnedDaysSuffix(purchasedAtMs: number | undefined): string {
  if (purchasedAtMs == null || !Number.isFinite(purchasedAtMs) || purchasedAtMs <= 0) return "";
  const days = Math.max(0, Math.floor((Date.now() - purchasedAtMs) / 86_400_000));
  return ` (${days} сут)`;
}

function housingLine(u: EconomyUser): string {
  const hk = u.housingKind ?? "none";
  const parts: string[] = [];
  if (hk === "rent") parts.push("Аренда");
  else if (hk === "owned") {
    parts.push(`${apartmentLabel(u.ownedApartmentId)}${housingOwnedDaysSuffix(u.ownedApartmentPurchasedAtMs)}`);
  }
  if (u.housingForeignKind === "owned") {
    parts.push(
      `${apartmentLabel(u.ownedForeignApartmentId)}${housingOwnedDaysSuffix(u.ownedForeignApartmentPurchasedAtMs)}`,
    );
  }
  return `Жильё: ${parts.length > 0 ? parts.join(" · ") : "нет"}`;
}

function phoneLine(u: EconomyUser): string {
  if (!u.hasPhone) return "Телефон: нет";
  const pl = getPhoneDef(u.phoneModelId)?.label ?? "есть";
  const sim = formatSimNumberFromUser(u);
  if (!sim) return `Телефон: ${pl} (сим нет)`;
  return `Телефон: ${pl} · ${sim}`;
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
    phoneLine(u),
    economyCarDisplayLine(u, { markdown: false }),
    housingLine(u),
    `Питомец: ${pet?.label ?? "нет"}`,
    "",
    `Работа: ${jobName}`,
    `СР: ${fmt(u.psTotal)} (${formatServerPlace(psPlace, r.totalPlayers)})`,
    `₽: ${fmt(u.rubles)} (${formatServerPlace(rubPlace, r.totalPlayers)})`,
  ];

  return {
    displayName: member.displayName,
    frameColorId: style.frameColorId,
    accent: style.accent,
    background: style.background,
    isTopPs: r.topPsUserId === userId,
    isTopRub: r.topRubUserId === userId,
    lines,
  };
}
