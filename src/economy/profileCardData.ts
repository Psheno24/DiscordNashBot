import { getApartmentDef, getCarDef, getPetDef, getPhoneDef } from "./economyCatalog.js";
import { economyJobTitle } from "./jobTitles.js";
import { computeGuildEconomyRanks, formatServerPlace, type GuildEconomyRanks } from "./profileCardRanks.js";
import { getProfileFrameColor, type ProfileFrameColorId } from "./profileThemes.js";
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

function housingLine(u: EconomyUser): string {
  const hk = u.housingKind ?? "none";
  const homeSov =
    hk === "rent"
      ? "аренда (сов.)"
      : hk === "owned"
        ? (getApartmentDef(u.ownedApartmentId)?.label ?? "сов.")
        : "нет (сов.)";
  const homeFor =
    u.housingForeignKind === "owned"
      ? (getApartmentDef(u.ownedForeignApartmentId)?.label ?? "зам.")
      : "нет (зам.)";
  return `Жильё: ${homeSov} · ${homeFor}`;
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
): ProfileCardContent {
  const guildId = member.guild.id;
  const userId = member.id;
  const r = ranks ?? computeGuildEconomyRanks(guildId);
  const frame = getProfileFrameColor(u.profileCardColor);

  const psPlace = r.psPlaceByUserId.get(userId) ?? r.totalPlayers;
  const rubPlace = r.rubPlaceByUserId.get(userId) ?? r.totalPlayers;

  const jobName = u.jobId ? economyJobTitle(u.jobId) : "не выбрана";
  const car = getCarDef(u.ownedCarId);
  const pet = u.ownedPetId ? getPetDef(u.ownedPetId) : undefined;

  const lines = [
    `Престиж: ${fmt(u.prestigePoints ?? 0)}`,
    `Быт: ${fmt(u.domesticPoints ?? 0)}`,
    "",
    truncateLine(phoneLine(u)),
    truncateLine(`Авто: ${car?.label ?? "нет"}`),
    truncateLine(housingLine(u)),
    truncateLine(`Питомец: ${pet?.label ?? "нет"}`),
    "",
    truncateLine(`Работа: ${jobName}`),
    `СР: ${fmt(u.psTotal)} (${formatServerPlace(psPlace, r.totalPlayers)})`,
    `₽: ${fmt(u.rubles)} (${formatServerPlace(rubPlace, r.totalPlayers)})`,
  ];

  return {
    displayName: truncateLine(member.displayName, 28),
    frameColorId: frame.id,
    accent: frame.accent,
    background: frame.background,
    isTopPs: r.topPsUserId === userId,
    isTopRub: r.topRubUserId === userId,
    lines,
  };
}
