import { getApartmentDef, getPetDef, getPhoneDef } from "./economyCatalog.js";
import { inflatedApartmentUtilityRub } from "./economyMacro.js";
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

function truncateLine(s: string, max = 52): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function ownedApartmentProfileText(guildId: string, aptId: string | undefined): string {
  const apt = getApartmentDef(aptId);
  if (!apt) return "—";
  const util = inflatedApartmentUtilityRub(guildId, apt.id);
  return `${apt.label} · ЖКХ ${fmt(util)} ₽/мес.`;
}

function housingLine(u: EconomyUser, guildId: string): string {
  const hk = u.housingKind ?? "none";
  const homeSov =
    hk === "rent"
      ? "аренда (советское жильё)"
      : hk === "owned"
        ? ownedApartmentProfileText(guildId, u.ownedApartmentId)
        : "нет (сов.)";
  const homeFor =
    u.housingForeignKind === "owned"
      ? ownedApartmentProfileText(guildId, u.ownedForeignApartmentId)
      : "нет (зам.)";
  return `Жильё: ${homeSov} · ${homeFor}`;
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
    truncateLine(phoneLine(u)),
    truncateLine(economyCarDisplayLine(u, { markdown: false })),
    truncateLine(housingLine(u, guildId)),
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
