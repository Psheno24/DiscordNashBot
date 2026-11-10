import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { UI } from "./copy.js";

/** То же, что `ECON_BUTTON_MENU` в panel / shop. */
export const ECON_BUTTON_MENU = "econ:menu";

/**
 * «Назад» когда назад = меню: Discord запрещает два одинаковых customId в одном сообщении.
 */
export const ECON_NAV_BACK_TO_MENU = "econ:nav:backMenu";

export function navBackCustomId(backId: string): string {
  return backId === ECON_BUTTON_MENU ? ECON_NAV_BACK_TO_MENU : backId;
}

/** Нижний ряд: Назад + Меню (последний ряд экрана). */
export function navBottomRow(backId: string, backLabel: string = UI.BACK): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(navBackCustomId(backId)).setLabel(backLabel).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel(UI.MENU).setStyle(ButtonStyle.Secondary),
  );
}

/** Только Меню — для корневых разделов хаба (профиль, работа, игроки). */
export function menuOnlyRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel(UI.MENU).setStyle(ButtonStyle.Secondary),
  );
}

/** Условия + Назад + Меню. */
export function detailsNavBottomRow(
  detailsId: string,
  backId: string,
  backLabel: string = UI.BACK,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(detailsId).setLabel(UI.DETAILS).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(navBackCustomId(backId)).setLabel(backLabel).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel(UI.MENU).setStyle(ButtonStyle.Secondary),
  );
}
