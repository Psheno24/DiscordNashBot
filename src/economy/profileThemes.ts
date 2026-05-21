/** Цвет рамки карточки (магазин → оформление). */
export type ProfileFrameColorId = "crimson" | "amber" | "ice" | "mint" | "violet";

export const PROFILE_COLOR_CHANGE_PRICE_RUB = 10_000;

/** Фон под текстом — пока всегда чёрный. */
export const PROFILE_CARD_BACKGROUND = "#0a0a0a";

export interface ProfileFrameColorDef {
  id: ProfileFrameColorId;
  label: string;
  accent: string;
}

export const PROFILE_FRAME_COLORS: ProfileFrameColorDef[] = [
  { id: "crimson", label: "Алый", accent: "#ff003c" },
  { id: "amber", label: "Янтарь", accent: "#ffb300" },
  { id: "ice", label: "Лёд", accent: "#4fc3f7" },
  { id: "mint", label: "Мята", accent: "#69f0ae" },
  { id: "violet", label: "Фиолет", accent: "#b388ff" },
];

const BY_ID = new Map(PROFILE_FRAME_COLORS.map((c) => [c.id, c]));

export function getProfileFrameColor(id: string | undefined): ProfileFrameColorDef {
  if (id && BY_ID.has(id as ProfileFrameColorId)) return BY_ID.get(id as ProfileFrameColorId)!;
  return BY_ID.get("crimson")!;
}

export function isProfileFrameColorId(s: string): s is ProfileFrameColorId {
  return BY_ID.has(s as ProfileFrameColorId);
}

export function resolveProfileCardStyle(storedId?: string, previewId?: ProfileFrameColorId) {
  const frame = getProfileFrameColor(previewId ?? storedId);
  return {
    frameColorId: frame.id,
    label: frame.label,
    accent: frame.accent,
    background: PROFILE_CARD_BACKGROUND,
  };
}
