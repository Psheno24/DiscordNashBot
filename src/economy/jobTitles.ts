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
