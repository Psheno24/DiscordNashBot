import type { JobId } from "./userStore.js";

const TITLES: Record<JobId, string> = {
  courier: "Доставка",
  waiter: "Уличный брокер",
  watchman: "Кладбище",
  dispatcher: "Колл-центр",
  assembler: "Склад",
  expediter: "Развлекательный центр",
  officeAnalyst: "Офис · аналитик",
  shadowFixer: "Схемы · посредник",
  soleProp: "ИП · услуги",
};

export function economyJobTitle(id: JobId): string {
  return TITLES[id] ?? id;
}

/** Короткие подписи для Telegram-кнопок (полный заголовок — в тексте экрана). */
const BUTTON_TITLES: Record<JobId, string> = {
  courier: "Доставка",
  waiter: "Брокер",
  watchman: "Кладбище",
  dispatcher: "Колл-центр",
  assembler: "Склад",
  expediter: "Развлечения",
  officeAnalyst: "Офис",
  shadowFixer: "Схемы",
  soleProp: "ИП",
};

export function economyJobButtonLabel(id: JobId): string {
  return BUTTON_TITLES[id] ?? economyJobTitle(id);
}
