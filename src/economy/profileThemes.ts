/** Цвет рамки карточки профиля (магазин → оформление). */
export type ProfileFrameColorId = "crimson" | "amber" | "ice" | "mint" | "violet";

export const PROFILE_COLOR_CHANGE_PRICE_RUB = 10_000;

export interface ProfileFrameColorDef {
  id: ProfileFrameColorId;
  label: string;
  accent: string;
  background: string;
}

export const PROFILE_FRAME_COLORS: ProfileFrameColorDef[] = [
  { id: "crimson", label: "Алый", accent: "#ff003c", background: "#14080c" },
  { id: "amber", label: "Янтарь", accent: "#ffb300", background: "#141008" },
  { id: "ice", label: "Лёд", accent: "#4fc3f7", background: "#081018" },
  { id: "mint", label: "Мята", accent: "#69f0ae", background: "#081410" },
  { id: "violet", label: "Фиолет", accent: "#b388ff", background: "#100818" },
];

const BY_ID = new Map(PROFILE_FRAME_COLORS.map((c) => [c.id, c]));

export function getProfileFrameColor(id: string | undefined): ProfileFrameColorDef {
  if (id && BY_ID.has(id as ProfileFrameColorId)) return BY_ID.get(id as ProfileFrameColorId)!;
  return BY_ID.get("crimson")!;
}

export function isProfileFrameColorId(s: string): s is ProfileFrameColorId {
  return BY_ID.has(s as ProfileFrameColorId);
}
