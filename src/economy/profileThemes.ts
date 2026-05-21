/** Фон карточки под текстом (магазин → оформление). */
export type ProfileCardBackgroundId = "crimson" | "amber" | "ice" | "mint" | "violet";

/** @deprecated alias */
export type ProfileFrameColorId = ProfileCardBackgroundId;

export const PROFILE_COLOR_CHANGE_PRICE_RUB = 10_000;

/** Рамка и строки СР/₽ — не меняются в магазине. */
export const DEFAULT_PROFILE_CARD_ACCENT = "#ff003c";
export const DEFAULT_PROFILE_CARD_BACKGROUND = "#14080c";

export interface ProfileCardBackgroundDef {
  id: ProfileCardBackgroundId;
  label: string;
  background: string;
}

export const PROFILE_CARD_BACKGROUNDS: ProfileCardBackgroundDef[] = [
  { id: "crimson", label: "Алый", background: "#14080c" },
  { id: "amber", label: "Янтарь", background: "#141008" },
  { id: "ice", label: "Лёд", background: "#081018" },
  { id: "mint", label: "Мята", background: "#081410" },
  { id: "violet", label: "Фиолет", background: "#100818" },
];

/** @deprecated use PROFILE_CARD_BACKGROUNDS */
export const PROFILE_FRAME_COLORS = PROFILE_CARD_BACKGROUNDS;

const BY_ID = new Map(PROFILE_CARD_BACKGROUNDS.map((c) => [c.id, c]));

export function getProfileCardBackground(id: string | undefined): ProfileCardBackgroundDef {
  if (id && BY_ID.has(id as ProfileCardBackgroundId)) return BY_ID.get(id as ProfileCardBackgroundId)!;
  return BY_ID.get("crimson")!;
}

/** @deprecated */
export function getProfileFrameColor(id: string | undefined): ProfileCardBackgroundDef & { accent: string } {
  const bg = getProfileCardBackground(id);
  return { ...bg, accent: DEFAULT_PROFILE_CARD_ACCENT };
}

export function isProfileCardBackgroundId(s: string): s is ProfileCardBackgroundId {
  return BY_ID.has(s as ProfileCardBackgroundId);
}

/** @deprecated */
export function isProfileFrameColorId(s: string): s is ProfileCardBackgroundId {
  return isProfileCardBackgroundId(s);
}

export function resolveProfileCardStyle(storedId?: string, previewId?: ProfileCardBackgroundId) {
  const bg = getProfileCardBackground(previewId ?? storedId);
  return {
    frameColorId: bg.id,
    label: bg.label,
    background: bg.background,
    accent: DEFAULT_PROFILE_CARD_ACCENT,
  };
}
