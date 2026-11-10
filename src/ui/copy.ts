/**
 * Единый словарь подписей и коротких текстов для Discord + Telegram.
 * Игрок видит одни и те же слова на обеих платформах.
 */

export const UI = {
  MENU: "Меню",
  BACK: "Назад",
  BACK_TG: "← Назад",
  CANCEL: "Отмена",
  CLOSE: "Закрыть",
  DETAILS: "Условия",
  MORE: "Подробнее",
  BUY: "Купить",
  BUY_FULL: "Купить",
  TRADE: "Обменять",
  SELL: "Продать",
  CONFIRM: "Подтвердить",
  CONFIRM_TRADE: "Подтвердить обмен",
  TO_WORK: "К работе",
  TO_PHONE: "К телефону",
  SHIFT: "На смену",
  SHIFT_DISCORD: "Выйти на смену",
  MY_JOB: "Моя работа",
  QUIT_JOB: "Уволиться",
  PICK_JOB: "Выбрать",
  SKILLS: "Навыки",
  SHOP: "Магазин",
  WORK: "Работа",
  PROFILE: "Профиль",
  PLAYERS: "Игроки",
  RENT: "Аренда",
  STATUS: "Статус",
  RULES: "Правила",
} as const;

/** Публичная панель в канале (Discord). */
export const PUBLIC_TERMINAL = {
  title: "Нейроком",
  body: [
    "**Нейроком** — терминал жизни в общине.",
    "",
    "Открой **Меню** (сообщение только тебе): профиль, работа, магазин, навыки.",
  ].join("\n"),
  menuButton: UI.MENU,
} as const;

/** Корневой ephemeral-хаб Discord. */
export const HUB = {
  title: "Терминал",
  body: "Профиль, работа, магазин и навыки — кнопками ниже.",
} as const;

/** Корневой экран Telegram. */
export const TG_HUB = {
  title: "Nash · терминал",
  body: ["Выбери раздел.", "Смены, навыки и магазин — кнопками ниже."].join("\n"),
} as const;

export const SHOP_HUB = {
  title: "Магазин",
  /** hint под балансом; детали — в разделах → Условия */
  hint: "Советское — быт. Заморское и госномер — престиж. Условия — внутри раздела.",
} as const;

export const WORK_HUB = {
  noJob: "Работы нет. Выбери уровень и профессию.",
  hint: "Смена — после КД. Ур. 2–3: навыки и жильё.",
} as const;

export const APPEARANCE = {
  tryPrefix: "", // кнопки = только имя цвета
  myCard: "Моя карточка",
} as const;
