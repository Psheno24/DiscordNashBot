import type { Client, GuildMember } from "discord.js";
import {
  canWorkNow,
  economyFormatSkillsNotify,
  economyFormatSkillsScreen,
  economyFormatTelegramJobCardScreen,
  economyFormatTelegramJobListScreen,
  economyFormatTelegramWorkScreen,
  economyCurrentJobRehireWarning,
  economyMarkdownToTelegramHtml,
  economyIsWorkJobId,
  economyJobButtonLabel,
  economyJobTitle,
  economyQuitJob,
  economyRunSolePropAdvert,
  economyRunSolePropControl,
  economyRunSolePropDeposit,
  economyRunSolePropStaff,
  economyRunSolePropWithdraw,
  economyRunTrainSkill,
  economyRunWorkShift,
  economySolePropBalances,
  economySolePropCalc,
  economyTakeJob,
  ECONOMY_TRAIN_COOLDOWN_MS,
  effectiveShiftCooldownMs,
  listWorkJobsByTier,
} from "../economy/panel.js";
import { getEconomyUser, lastWorkAtForJob, type JobId, type SkillId } from "../economy/userStore.js";
import {
  getNotifyLatch,
  getTelegramLink,
  getTelegramUiState,
  listLinkedTelegramUserIds,
  patchNotifyLatch,
  patchTelegramUiState,
  peekTelegramLinkCode,
  removeTelegramLinkCode,
  setTelegramLink,
} from "./bridgeStore.js";
import { isTelegramBridgeConfigured, telegramAllowedUserIds, telegramBotToken } from "./env.js";
import {
  beginPetRenamePending,
  clearPendingInput,
  handlePetRenameText,
  isPetRenameCallback,
  routeShopCallback,
  screenShopHub,
} from "./shop.js";
import {
  btnLabel,
  fmtMs,
  fmtMsCompact,
  kb,
  navRow,
  row,
  TG_BTN_FULL,
  type InlineBtn,
  type InlineKb,
  type ScreenPayload,
} from "./tgUi.js";

type TgMsg = { message?: { chat: { id: number }; text?: string; from?: { id: number } } };
type TgCb = {
  id: string;
  data?: string;
  from: { id: number };
  message?: { chat: { id: number }; message_id: number };
};

type TgApiResult = { ok?: boolean; result?: { message_id?: number } };

function runBackground(taskName: string, work: () => Promise<unknown>) {
  void work().catch((e) => console.error(`Telegram ${taskName}:`, e));
}

function tgApi(token: string, method: string, body?: object): Promise<TgApiResult> {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then((r) => r.json() as Promise<TgApiResult>);
}

async function registerBotCommands(token: string) {
  await tgApi(token, "setMyCommands", {
    commands: [
      { command: "menu", description: "Главное меню" },
      { command: "work", description: "Работа и смены" },
      { command: "skills", description: "Навыки и тренировка" },
      { command: "shop", description: "Магазин" },
      { command: "shift", description: "Выйти на смену" },
      { command: "train", description: "Тренировка (communication|logistics|discipline)" },
      { command: "status", description: "Статус работы и навыков" },
      { command: "link", description: "Привязка Discord (код из профиля)" },
      { command: "help", description: "Справка" },
    ],
  });
}

function workReadyBoundaryMs(u: ReturnType<typeof getEconomyUser>, jobId: JobId, now: number): number {
  const last = lastWorkAtForJob(u, jobId);
  const cd = effectiveShiftCooldownMs(u, jobId, now);
  return last + cd;
}

function mainMenuKeyboard(): InlineKb {
  return kb(
    row({ text: "Работа", callback_data: "w" }, { text: "Навыки", callback_data: "sk" }),
    row({ text: "Магазин", callback_data: "s" }, { text: "Статус", callback_data: "st" }),
  );
}

function workMenuKeyboard(member: GuildMember): InlineKb {
  const u = getEconomyUser(member.guild.id, member.id);
  const rows: InlineBtn[][] = [];

  if (u.jobId) {
    rows.push(row({ text: "Моя работа", callback_data: `j:${u.jobId}` }));
    if (u.jobId === "soleProp") {
      const now = Date.now();
      const adR = !u.solePropAdvertReadyAt || now >= u.solePropAdvertReadyAt;
      const stR = !u.solePropStaffReadyAt || now >= u.solePropStaffReadyAt;
      const ctR = !u.solePropControlReadyAt || now >= u.solePropControlReadyAt;
      rows.push(
        row(
          {
            text: adR ? "Реклама" : `Реклама · ${fmtMsCompact((u.solePropAdvertReadyAt ?? 0) - now)}`,
            callback_data: "ip:ad",
          },
          {
            text: stR ? "Персонал" : `Персонал · ${fmtMsCompact((u.solePropStaffReadyAt ?? 0) - now)}`,
            callback_data: "ip:st",
          },
          {
            text: ctR ? "Контроль" : `Контроль · ${fmtMsCompact((u.solePropControlReadyAt ?? 0) - now)}`,
            callback_data: "ip:ct",
          },
        ),
      );
    } else {
      const now = Date.now();
      const st = canWorkNow(u, u.jobId, now);
      rows.push(
        row({
          text: st.ok ? "На смену" : `КД ${fmtMsCompact(st.msLeft)}`,
          callback_data: "sh",
        }),
      );
    }
  }

  rows.push(row({ text: "Ур. 1", callback_data: "wt1" }));
  rows.push(row({ text: "Ур. 2", callback_data: "wt2" }));
  rows.push(row({ text: "Ур. 3", callback_data: "wt3" }));
  rows.push(navRow("m", "← Меню"));
  return kb(...rows);
}

function tierListKeyboard(tier: "t1" | "t2" | "t3"): InlineKb {
  const jobs = listWorkJobsByTier(tier);
  const rows: InlineBtn[][] = [];
  for (const id of jobs) {
    rows.push(row({ text: btnLabel(economyJobButtonLabel(id), TG_BTN_FULL), callback_data: `j:${id}` }));
  }
  rows.push(navRow("w", "← Работа"));
  return kb(...rows);
}

function jobCardKeyboard(member: GuildMember, jobId: JobId): InlineKb {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const rows: InlineBtn[][] = [];
  const backTier =
    jobId === "courier" || jobId === "waiter" || jobId === "watchman"
      ? "wt1"
      : jobId === "dispatcher" || jobId === "assembler" || jobId === "expediter"
        ? "wt2"
        : "wt3";

  if (u.jobId === jobId) {
    if (jobId === "soleProp") {
      const adR = !u.solePropAdvertReadyAt || now >= u.solePropAdvertReadyAt;
      const stR = !u.solePropStaffReadyAt || now >= u.solePropStaffReadyAt;
      const ctR = !u.solePropControlReadyAt || now >= u.solePropControlReadyAt;
      const biz = u.solePropCapitalRub ?? 0;
      rows.push(
        row(
          {
            text: adR ? "Реклама" : `Реклама · ${fmtMsCompact((u.solePropAdvertReadyAt ?? 0) - now)}`,
            callback_data: "ip:ad",
          },
          {
            text: stR ? "Персонал" : `Персонал · ${fmtMsCompact((u.solePropStaffReadyAt ?? 0) - now)}`,
            callback_data: "ip:st",
          },
          {
            text: ctR ? "Контроль" : `Контроль · ${fmtMsCompact((u.solePropControlReadyAt ?? 0) - now)}`,
            callback_data: "ip:ct",
          },
        ),
      );
      rows.push(
        row(
          { text: "В бизнес", callback_data: "ip:dep" },
          { text: biz >= 1 ? "На счёт" : "На счёт (пусто)", callback_data: "ip:wd" },
          { text: "Калькулятор", callback_data: "ip:calc" },
        ),
      );
      rows.push(row({ text: "Уволиться", callback_data: "q" }));
    } else {
      const st = canWorkNow(u, jobId, now);
      rows.push(
        row({
          text: st.ok ? "На смену" : `КД ${fmtMsCompact(st.msLeft)}`,
          callback_data: "sh",
        }),
      );
      rows.push(row({ text: "Уволиться", callback_data: "q" }));
    }
  } else {
    rows.push(row({ text: "Выбрать", callback_data: `t:${jobId}` }));
  }

  rows.push(row({ text: "← Каталог", callback_data: backTier }));
  rows.push(navRow("w", "← Работа"));
  return kb(...rows);
}

function switchConfirmKeyboard(jobId: JobId): InlineKb {
  return kb(
    row({ text: "Да, сменить", callback_data: `ty:${jobId}` }),
    row({ text: "Отмена", callback_data: `j:${jobId}` }),
  );
}

function quitConfirmKeyboard(): InlineKb {
  return kb(
    row({ text: "Да, уволиться", callback_data: "qy" }),
    row({ text: "Отмена", callback_data: "w" }),
  );
}

const SKILL_BTN: Record<SkillId, string> = {
  communication: "Коммуникация",
  logistics: "Логистика",
  discipline: "Дисциплина",
};

function skillTrainLabel(skillId: SkillId, ready: boolean, msLeft: number): string {
  const name = SKILL_BTN[skillId];
  if (ready) return name;
  return btnLabel(`${name} · ${fmtMsCompact(msLeft)}`, TG_BTN_FULL);
}

function skillsKeyboard(member: GuildMember): InlineKb {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const msLeft = u.lastTrainAt ? Math.max(0, u.lastTrainAt + ECONOMY_TRAIN_COOLDOWN_MS - now) : 0;
  const ready = msLeft <= 0;
  return kb(
    row({ text: skillTrainLabel("communication", ready, msLeft), callback_data: "tr:communication" }),
    row({ text: skillTrainLabel("logistics", ready, msLeft), callback_data: "tr:logistics" }),
    row({ text: skillTrainLabel("discipline", ready, msLeft), callback_data: "tr:discipline" }),
    navRow("w", "← Работа"),
  );
}

function skillsKeyboardForUser(u: ReturnType<typeof getEconomyUser>): InlineKb {
  const now = Date.now();
  const msLeft = u.lastTrainAt ? Math.max(0, u.lastTrainAt + ECONOMY_TRAIN_COOLDOWN_MS - now) : 0;
  const ready = msLeft <= 0;
  return kb(
    row({ text: skillTrainLabel("communication", ready, msLeft), callback_data: "tr:communication" }),
    row({ text: skillTrainLabel("logistics", ready, msLeft), callback_data: "tr:logistics" }),
    row({ text: skillTrainLabel("discipline", ready, msLeft), callback_data: "tr:discipline" }),
    navRow("m", "← Меню"),
  );
}

function shiftNotifyKeyboard(): InlineKb {
  return kb(
    row({ text: "На смену", callback_data: "sh" }),
    row({ text: "Работа", callback_data: "w" }),
  );
}

function ipReadyNotifyKeyboard(action: "ct" | "st" | "ad"): InlineKb {
  const label = action === "ct" ? "Контроль" : action === "st" ? "Персонал" : "Реклама";
  return kb(
    row({ text: label, callback_data: `ip:${action}` }),
    row({ text: "Моя работа", callback_data: "j:soleProp" }, { text: "Работа", callback_data: "w" }),
  );
}

async function sendMessage(token: string, chatId: number, text: string, replyMarkup?: InlineKb): Promise<number | undefined> {
  const chunk = text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
  const res = await tgApi(token, "sendMessage", {
    chat_id: chatId,
    text: chunk,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
  return res.ok ? res.result?.message_id : undefined;
}

async function sendPhoto(
  token: string,
  chatId: number,
  caption: string,
  png: Buffer,
  replyMarkup?: InlineKb,
): Promise<number | undefined> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", caption.length > 1000 ? `${caption.slice(0, 990)}…` : caption);
  form.append("parse_mode", "HTML");
  form.append("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), "card.png");
  if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup));
  const res = (await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
  }).then((r) => r.json())) as TgApiResult;
  return res.ok ? res.result?.message_id : undefined;
}

async function deleteMessage(token: string, chatId: number, messageId: number) {
  await tgApi(token, "deleteMessage", { chat_id: chatId, message_id: messageId });
}

async function editScreen(
  token: string,
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: InlineKb,
): Promise<boolean> {
  const chunk = text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
  const res = await tgApi(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: chunk,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
  return Boolean(res.ok);
}

async function answerCallback(token: string, callbackId: string, text?: string) {
  await tgApi(token, "answerCallbackQuery", {
    callback_query_id: callbackId,
    text: text?.slice(0, 200),
    show_alert: Boolean(text && text.length > 80),
  });
}

async function resolveMember(client: Client, guildId: string, discordUserId: string) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;
  return guild.members.fetch({ user: discordUserId, force: false }).catch(() => null);
}

function screenMain(): ScreenPayload {
  return {
    text: [
      "<b>Nash · терминал</b>",
      "",
      "Кнопки для смен, навыков и магазина.",
      "Подробности — в тексте экрана; нажимай действия ниже.",
    ].join("\n"),
    markup: mainMenuKeyboard(),
  };
}

function screenWork(member: GuildMember): ScreenPayload {
  return { text: economyFormatTelegramWorkScreen(member), markup: workMenuKeyboard(member) };
}

function screenTier(member: GuildMember, tier: "t1" | "t2" | "t3"): ScreenPayload {
  return {
    text: economyFormatTelegramJobListScreen(member.guild.id, tier),
    markup: tierListKeyboard(tier),
  };
}

function screenJob(member: GuildMember, jobId: JobId): ScreenPayload {
  return { text: economyFormatTelegramJobCardScreen(member, jobId), markup: jobCardKeyboard(member, jobId) };
}

function screenSkills(member: GuildMember): ScreenPayload {
  return { text: economyFormatSkillsScreen(member), markup: skillsKeyboard(member) };
}

function screenSwitchConfirm(currentTitle: string, newTitle: string, jobId: JobId, rehireWarning?: string): ScreenPayload {
  const lines = [
    "<b>Сменить работу?</b>",
    "",
    `Сейчас: <b>${currentTitle}</b>`,
    `Новая: <b>${newTitle}</b>`,
    "",
    "Смена на текущей работе должна быть без КД.",
  ];
  if (rehireWarning) {
    lines.push("", economyMarkdownToTelegramHtml(rehireWarning));
  }
  return {
    text: lines.join("\n"),
    markup: switchConfirmKeyboard(jobId),
  };
}

/** Одна «панель» в чате: правка того же сообщения (как embed в Discord). */
async function presentPanel(
  tgUserId: string,
  token: string,
  chatId: number,
  payload: ScreenPayload,
  opts?: { messageId?: number; ack?: TgCb },
): Promise<void> {
  if (opts?.ack) await answerCallback(token, opts.ack.id);
  const ui = getTelegramUiState(tgUserId);
  const tryIds = [opts?.messageId, ui.panelMessageId].filter((x): x is number => x != null);
  for (const mid of tryIds) {
    const ok = await editScreen(token, chatId, mid, payload.text, payload.markup);
    if (ok) {
      patchTelegramUiState(tgUserId, { panelMessageId: mid });
      return;
    }
  }
  const sent = await sendMessage(token, chatId, payload.text, payload.markup);
  if (sent != null) patchTelegramUiState(tgUserId, { panelMessageId: sent });
}

async function pushNotify(
  token: string,
  tgUserId: string,
  chatId: number,
  kind: "work" | "train",
  text: string,
  markup: InlineKb,
) {
  const ui = getTelegramUiState(tgUserId);
  const oldId = kind === "work" ? ui.notifyWorkMessageId : ui.notifyTrainMessageId;
  if (oldId) await deleteMessage(token, chatId, oldId);
  const newId = await sendMessage(token, chatId, text, markup);
  if (newId == null) return;
  patchTelegramUiState(tgUserId, kind === "work" ? { notifyWorkMessageId: newId } : { notifyTrainMessageId: newId });
}

function screenStatus(member: GuildMember): ScreenPayload {
  const eu = getEconomyUser(member.guild.id, member.id);
  const jid = eu.jobId;
  let line = "Работа: <b>не выбрана</b>";
  if (jid && jid !== "soleProp") {
    const st = canWorkNow(eu, jid, Date.now());
    line = st.ok
      ? `Смена (<b>${economyJobTitle(jid)}</b>): можно`
      : `Смена (<b>${economyJobTitle(jid)}</b>): КД ${fmtMs(st.msLeft)}`;
  } else if (jid === "soleProp") {
    const now = Date.now();
    const ctL = (eu.solePropControlReadyAt ?? 0) - now;
    const biz = (eu.solePropCapitalRub ?? 0).toLocaleString("ru-RU");
    line =
      ctL > 0
        ? `ИП · контроль через ${fmtMs(ctL)} · бизнес ${biz} ₽`
        : `ИП · контроль <b>можно</b> · бизнес ${biz} ₽`;
  }
  let tline = "Навыки: <b>можно</b>";
  if (eu.lastTrainAt) {
    const left = eu.lastTrainAt + ECONOMY_TRAIN_COOLDOWN_MS - Date.now();
    tline = left > 0 ? `Навыки: КД ${fmtMs(left)}` : "Навыки: <b>можно</b>";
  }
  return {
    text: ["<b>Статус</b>", "", line, tline, "", "Магазин — кнопка ниже."].join("\n"),
    markup: mainMenuKeyboard(),
  };
}

function screenAfterShift(member: GuildMember): ScreenPayload {
  return { text: economyFormatTelegramWorkScreen(member), markup: workMenuKeyboard(member) };
}

function screenAfterTrain(member: GuildMember, skillLabel: string, rankDisplay: string): ScreenPayload {
  return {
    text: [`<b>${skillLabel}</b> → <b>${rankDisplay}</b>.`, "", economyFormatSkillsScreen(member)].join("\n"),
    markup: skillsKeyboard(member),
  };
}

async function requireLink(
  client: Client,
  tgUserId: string,
  chatId: number,
  token: string,
  ack?: TgCb,
): Promise<{ member: GuildMember; guildId: string } | null> {
  const link = getTelegramLink(tgUserId);
  if (!link) {
    const msg = "Сначала привяжи аккаунт: <code>/link КОД</code> из Discord (профиль → Telegram).";
    if (ack) await answerCallback(token, ack.id, "Нужна привязка");
    else await sendMessage(token, chatId, msg);
    return null;
  }
  const member = await resolveMember(client, link.guildId, link.discordUserId);
  if (!member) {
    const t = "Не найден участник Discord.";
    if (ack) await answerCallback(token, ack.id, t);
    else await sendMessage(token, chatId, t);
    return null;
  }
  return { member, guildId: link.guildId };
}

async function handleShift(client: Client, tgUserId: string, chatId: number, token: string, ack?: TgCb, messageId?: number) {
  const ctx = await requireLink(client, tgUserId, chatId, token, ack);
  if (!ctx) return;
  const r = await economyRunWorkShift(client, ctx.member);
  if (!r.ok) {
    const msg =
      r.kind === "cooldown" ? "Смена на КД." : economyMarkdownToTelegramHtml(r.message).replace(/<[^>]+>/g, "");
    if (ack) await answerCallback(token, ack.id, msg.slice(0, 180));
    await presentPanel(tgUserId, token, chatId, screenWork(ctx.member), { messageId });
    return;
  }
  if (ack) await answerCallback(token, ack.id, "Готово");
  await presentPanel(tgUserId, token, chatId, screenAfterShift(ctx.member), { messageId });
}

async function handleTrain(
  client: Client,
  tgUserId: string,
  chatId: number,
  token: string,
  skillId: SkillId,
  ack?: TgCb,
  messageId?: number,
) {
  const ctx = await requireLink(client, tgUserId, chatId, token, ack);
  if (!ctx) return;
  const tr = economyRunTrainSkill(ctx.member, skillId);
  if (!tr.ok) {
    if (ack) {
      const u = getEconomyUser(ctx.member.guild.id, ctx.member.id);
      const left = u.lastTrainAt ? Math.max(0, u.lastTrainAt + ECONOMY_TRAIN_COOLDOWN_MS - Date.now()) : 0;
      await answerCallback(
        token,
        ack.id,
        tr.kind === "unknown_skill" ? "Неверный навык" : left > 0 ? `КД ${fmtMsCompact(left)}` : "КД",
      );
    }
    await presentPanel(tgUserId, token, chatId, screenSkills(ctx.member), { messageId });
    return;
  }
  if (ack) await answerCallback(token, ack.id, "Готово");
  await presentPanel(tgUserId, token, chatId, screenAfterTrain(ctx.member, tr.skillLabel, tr.rankDisplay), { messageId });
}

async function handleTake(
  client: Client,
  tgUserId: string,
  chatId: number,
  token: string,
  jobId: JobId,
  force: boolean,
  ack?: TgCb,
  messageId?: number,
) {
  const ctx = await requireLink(client, tgUserId, chatId, token, ack);
  if (!ctx) return;
  const r = economyTakeJob(ctx.member, jobId, { forceSwitch: force });
  if (!r.ok) {
    if (r.kind === "missing_skills") {
      if (ack) await answerCallback(token, ack.id, "Не хватает навыков");
      await presentPanel(
        tgUserId,
        token,
        chatId,
        {
          text: `<b>Не хватает навыков:</b>\n${r.missing.map((m) => `· ${m}`).join("\n")}\n\n${economyFormatTelegramWorkScreen(ctx.member)}`,
          markup: workMenuKeyboard(ctx.member),
        },
        { messageId },
      );
      return;
    }
    if (r.kind === "need_housing") {
      if (ack) await answerCallback(token, ack.id, "Нужно жильё");
      await presentPanel(
        tgUserId,
        token,
        chatId,
        {
          text:
            "Сначала оформите <b>жильё</b> (аренда или квартира) в <b>Магазине</b> — для профессий ур. 2+.\n\n" +
            economyFormatTelegramWorkScreen(ctx.member),
          markup: kb(
            row({ text: "Магазин · Жильё", callback_data: "s:hs" }),
            ...workMenuKeyboard(ctx.member).inline_keyboard,
          ),
        },
        { messageId },
      );
      return;
    }
    if (r.kind === "shift_cooldown") {
      if (ack) await answerCallback(token, ack.id, `КД ${fmtMs(r.msLeft)}`);
      await presentPanel(tgUserId, token, chatId, screenWork(ctx.member), { messageId });
      return;
    }
    if (r.kind === "confirm_switch") {
      await presentPanel(
        tgUserId,
        token,
        chatId,
        screenSwitchConfirm(r.currentTitle, r.newTitle, r.jobId, r.rehireWarning),
        { messageId, ack },
      );
      return;
    }
    return;
  }
  if (ack) await answerCallback(token, ack.id, r.kind === "already_current" ? "Уже эта работа" : "Принято");
  await presentPanel(tgUserId, token, chatId, screenJob(ctx.member, jobId), { messageId });
}

async function handleQuit(
  client: Client,
  tgUserId: string,
  chatId: number,
  token: string,
  confirm: boolean,
  ack?: TgCb,
  messageId?: number,
) {
  const ctx = await requireLink(client, tgUserId, chatId, token, ack);
  if (!ctx) return;
  if (!confirm) {
    const warn = economyCurrentJobRehireWarning(ctx.member);
    const lines = ["<b>Уволиться?</b>", "", "Нельзя уволиться, пока идёт КД смены на текущей работе."];
    if (warn) lines.push("", economyMarkdownToTelegramHtml(warn));
    await presentPanel(
      tgUserId,
      token,
      chatId,
      { text: lines.join("\n"), markup: quitConfirmKeyboard() },
      { messageId, ack },
    );
    return;
  }
  const r = economyQuitJob(ctx.member);
  if (!r.ok) {
    if (ack) {
      if (r.kind === "shift_cooldown") await answerCallback(token, ack.id, `КД ${fmtMs(r.msLeft ?? 0)}`);
      else await answerCallback(token, ack.id, "Нет работы");
    }
    await presentPanel(tgUserId, token, chatId, screenWork(ctx.member), { messageId });
    return;
  }
  if (ack) await answerCallback(token, ack.id, "Уволены");
  await presentPanel(tgUserId, token, chatId, screenWork(ctx.member), { messageId });
}

const IP_PENDING_TTL_MS = 5 * 60_000;

function parseRubAmount(text: string): number | null {
  const n = Math.floor(Number(text.trim().replace(/\s/g, "").replace(",", ".")));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function beginIpPending(tgUserId: string, kind: "ipDep" | "ipWd" | "ipCalc" | "ipAd"): void {
  patchTelegramUiState(tgUserId, {
    pendingInput: { kind, expiresAtMs: Date.now() + IP_PENDING_TTL_MS },
  });
}

function screenIpNote(member: GuildMember, note?: string): ScreenPayload {
  const base = economyFormatTelegramWorkScreen(member);
  const text = note ? `${economyMarkdownToTelegramHtml(note)}\n\n${base}` : base;
  return { text, markup: jobCardKeyboard(member, "soleProp") };
}

async function promptIpAmount(
  tgUserId: string,
  token: string,
  chatId: number,
  member: GuildMember,
  kind: "ipDep" | "ipWd" | "ipCalc" | "ipAd",
  ack?: TgCb,
  messageId?: number,
) {
  const bal = economySolePropBalances(member);
  let text: string;
  if (kind === "ipDep") {
    text = [
      "<b>В бизнес</b>",
      "",
      `Счёт: <b>${bal.wallet.toLocaleString("ru-RU")}</b> ₽`,
      `Бизнес: <b>${bal.biz.toLocaleString("ru-RU")}</b> ₽`,
      "",
      "Пришли сумму целым числом ₽.",
    ].join("\n");
  } else if (kind === "ipWd") {
    text = [
      "<b>На счёт</b>",
      "",
      `Бизнес: <b>${bal.biz.toLocaleString("ru-RU")}</b> ₽`,
      bal.withdrawFeePercent > 0 ? `Комиссия вывода: <b>${bal.withdrawFeePercent}%</b>` : "Комиссии нет.",
      "",
      "Пришли сумму целым числом ₽.",
    ].join("\n");
  } else if (kind === "ipAd") {
    text = [
      "<b>Реклама</b>",
      "",
      `Бизнес: <b>${bal.biz.toLocaleString("ru-RU")}</b> ₽`,
      `Диапазон: <b>${bal.adMinRub.toLocaleString("ru-RU")}</b>–<b>${bal.adMaxRub.toLocaleString("ru-RU")}</b> ₽`,
      "",
      "Пришли сумму рекламы целым числом ₽ (риск потери с баланса бизнеса).",
    ].join("\n");
  } else {
    text = [
      "<b>Калькулятор ИП</b>",
      "",
      `Сейчас в бизнесе: <b>${bal.biz.toLocaleString("ru-RU")}</b> ₽`,
      "",
      "Пришли сумму капитала для прогноза суточного оклада.",
    ].join("\n");
  }
  beginIpPending(tgUserId, kind);
  await presentPanel(
    tgUserId,
    token,
    chatId,
    { text, markup: kb(navRow(`j:soleProp`, "Отмена")) },
    { messageId, ack },
  );
}

async function handleIpAmountMessage(
  client: Client,
  tgUserId: string,
  chatId: number,
  token: string,
  kind: "ipDep" | "ipWd" | "ipCalc" | "ipAd",
  text: string,
) {
  const ctx = await requireLink(client, tgUserId, chatId, token);
  if (!ctx) {
    clearPendingInput(tgUserId);
    return;
  }
  const amount = parseRubAmount(text);
  if (amount == null || (kind !== "ipCalc" && amount < 1)) {
    await presentPanel(tgUserId, token, chatId, {
      text: "Нужно целое число ₽. Повтори или нажми <b>Отмена</b>.",
      markup: kb(navRow(`j:soleProp`, "Отмена")),
    });
    return;
  }
  clearPendingInput(tgUserId);
  const run =
    kind === "ipDep"
      ? economyRunSolePropDeposit(ctx.member, amount)
      : kind === "ipWd"
        ? economyRunSolePropWithdraw(ctx.member, amount)
        : kind === "ipAd"
          ? economyRunSolePropAdvert(ctx.member, amount)
          : economySolePropCalc(ctx.member, amount);
  if (!run.ok) {
    await presentPanel(tgUserId, token, chatId, screenIpNote(ctx.member, run.message));
    return;
  }
  await presentPanel(tgUserId, token, chatId, screenIpNote(ctx.member, run.detail));
}

async function handleIpAction(
  client: Client,
  tgUserId: string,
  chatId: number,
  token: string,
  action: "ct" | "st" | "dep" | "wd" | "calc" | "ad",
  ack?: TgCb,
  messageId?: number,
) {
  const ctx = await requireLink(client, tgUserId, chatId, token, ack);
  if (!ctx) return;
  const u = getEconomyUser(ctx.member.guild.id, ctx.member.id);
  if (u.jobId !== "soleProp") {
    if (ack) await answerCallback(token, ack.id, "Только на ИП");
    await presentPanel(tgUserId, token, chatId, screenWork(ctx.member), { messageId });
    return;
  }
  if (action === "dep" || action === "wd" || action === "calc" || action === "ad") {
    if (action === "wd" && (u.solePropCapitalRub ?? 0) < 1) {
      if (ack) await answerCallback(token, ack.id, "Бизнес пуст");
      await presentPanel(tgUserId, token, chatId, screenIpNote(ctx.member), { messageId });
      return;
    }
    const pendingKind =
      action === "dep" ? "ipDep" : action === "wd" ? "ipWd" : action === "ad" ? "ipAd" : "ipCalc";
    await promptIpAmount(tgUserId, token, chatId, ctx.member, pendingKind, ack, messageId);
    return;
  }
  const run = action === "ct" ? economyRunSolePropControl(ctx.member) : economyRunSolePropStaff(ctx.member);
  if (!run.ok) {
    if (ack) {
      await answerCallback(
        token,
        ack.id,
        run.kind === "cooldown" ? `КД ${fmtMsCompact(run.msLeft ?? 0)}` : run.message.replace(/\*\*/g, ""),
      );
    }
    await presentPanel(tgUserId, token, chatId, screenIpNote(ctx.member), { messageId });
    return;
  }
  if (ack) await answerCallback(token, ack.id, "Готово");
  await presentPanel(tgUserId, token, chatId, screenIpNote(ctx.member, run.detail), { messageId });
}

async function routeCallback(client: Client, token: string, tgUserId: string, cq: TgCb): Promise<void> {
  const data = cq.data ?? "";
  const chatId = cq.message?.chat.id ?? Number(tgUserId);
  const messageId = cq.message?.message_id;

  if (data === "m") {
    clearPendingInput(tgUserId);
    await presentPanel(tgUserId, token, chatId, screenMain(), { messageId, ack: cq });
    return;
  }
  if (data === "w") {
    clearPendingInput(tgUserId);
    const ctx = await requireLink(client, tgUserId, chatId, token, cq);
    if (!ctx) return;
    await presentPanel(tgUserId, token, chatId, screenWork(ctx.member), { messageId, ack: cq });
    return;
  }
  if (data === "ip" || data.startsWith("ip:")) {
    const action =
      data === "ip:ct"
        ? "ct"
        : data === "ip:st"
          ? "st"
          : data === "ip:dep"
            ? "dep"
            : data === "ip:wd"
              ? "wd"
              : data === "ip:calc"
                ? "calc"
                : data === "ip:ad"
                  ? "ad"
                  : null;
    if (!action) {
      await answerCallback(token, cq.id, "Неизвестно");
      return;
    }
    await handleIpAction(client, tgUserId, chatId, token, action, cq, messageId);
    return;
  }
  if (data === "wt1" || data === "wt2" || data === "wt3") {
    const ctx = await requireLink(client, tgUserId, chatId, token, cq);
    if (!ctx) return;
    const tier = data === "wt1" ? "t1" : data === "wt2" ? "t2" : "t3";
    await presentPanel(tgUserId, token, chatId, screenTier(ctx.member, tier), { messageId, ack: cq });
    return;
  }
  if (data === "sk") {
    clearPendingInput(tgUserId);
    const ctx = await requireLink(client, tgUserId, chatId, token, cq);
    if (!ctx) return;
    await presentPanel(tgUserId, token, chatId, screenSkills(ctx.member), { messageId, ack: cq });
    return;
  }
  if (data === "sh" || data === "shift") {
    await handleShift(client, tgUserId, chatId, token, cq, messageId);
    return;
  }
  if (data === "q") {
    await handleQuit(client, tgUserId, chatId, token, false, cq, messageId);
    return;
  }
  if (data === "qy") {
    await handleQuit(client, tgUserId, chatId, token, true, cq, messageId);
    return;
  }
  if (data === "st") {
    const ctx = await requireLink(client, tgUserId, chatId, token, cq);
    if (!ctx) return;
    await presentPanel(tgUserId, token, chatId, screenStatus(ctx.member), { messageId, ack: cq });
    return;
  }
  if (data.startsWith("j:")) {
    const raw = data.slice(2);
    if (!economyIsWorkJobId(raw)) {
      await answerCallback(token, cq.id, "Неизвестная работа");
      return;
    }
    const ctx = await requireLink(client, tgUserId, chatId, token, cq);
    if (!ctx) return;
    await presentPanel(tgUserId, token, chatId, screenJob(ctx.member, raw), { messageId, ack: cq });
    return;
  }
  if (data.startsWith("t:")) {
    const raw = data.slice(2);
    if (!economyIsWorkJobId(raw)) return;
    await handleTake(client, tgUserId, chatId, token, raw, false, cq, messageId);
    return;
  }
  if (data.startsWith("ty:")) {
    const raw = data.slice(3);
    if (!economyIsWorkJobId(raw)) return;
    await handleTake(client, tgUserId, chatId, token, raw, true, cq, messageId);
    return;
  }
  if (data.startsWith("tr:") || data.startsWith("train:")) {
    const sid = (data.startsWith("tr:") ? data.slice(3) : data.slice(6)) as SkillId;
    await handleTrain(client, tgUserId, chatId, token, sid, cq, messageId);
    return;
  }

  // Магазин
  if (data === "s" || data.startsWith("s:")) {
    const ctx = await requireLink(client, tgUserId, chatId, token, cq);
    if (!ctx) return;

    const renameUid = isPetRenameCallback(data);
    if (renameUid) beginPetRenamePending(tgUserId, renameUid);
    else if (!data.startsWith("s:an:v:")) clearPendingInput(tgUserId);

    let acked = false;
    const toast = async (text?: string) => {
      if (acked) return;
      acked = true;
      await answerCallback(token, cq.id, text);
    };

    const handled = await routeShopCallback({
      client,
      member: ctx.member,
      data,
      present: async (payload) => {
        await toast();
        await presentPanel(tgUserId, token, chatId, payload, { messageId });
      },
      toast,
      sendPhoto: async (caption, png, markup) => {
        await toast();
        const sent = await sendPhoto(token, chatId, caption, png, markup);
        if (sent != null) patchTelegramUiState(tgUserId, { panelMessageId: sent });
      },
    });
    if (!handled) await toast();
    return;
  }

  await answerCallback(token, cq.id);
}

async function tickNotifications(client: Client, token: string) {
  const allowed = telegramAllowedUserIds();
  const linkedIds = listLinkedTelegramUserIds();
  const tgIds = allowed.size > 0 ? linkedIds.filter((id) => allowed.has(id)) : linkedIds;
  for (const tgId of tgIds) {
    const link = getTelegramLink(tgId);
    if (!link) continue;
    const chatId = Number(tgId);
    const u = getEconomyUser(link.guildId, link.discordUserId);
    const now = Date.now();
    const latch = getNotifyLatch(tgId);

    const jobId = u.jobId;
    if (jobId && jobId !== "soleProp") {
      const last = lastWorkAtForJob(u, jobId);
      // Без хотя бы одной смены на этой работе не спамим «можно выйти».
      if (last > 0) {
        const st = canWorkNow(u, jobId, now);
        const boundary = workReadyBoundaryMs(u, jobId, now);
        if (st.ok && boundary > 0 && latch.lastWorkBoundaryNotifiedMs !== boundary) {
          await pushNotify(
            token,
            tgId,
            chatId,
            "work",
            `Можно выйти на смену: <b>${economyJobTitle(jobId)}</b>.`,
            shiftNotifyKeyboard(),
          );
          patchNotifyLatch(tgId, { lastWorkBoundaryNotifiedMs: boundary });
        }
      }
    } else if (jobId === "soleProp") {
      type IpReady = {
        label: string;
        action: "ct" | "st" | "ad";
        readyAt: number | undefined;
        latchKey: "lastIpControlBoundaryNotifiedMs" | "lastIpStaffBoundaryNotifiedMs" | "lastIpAdvertBoundaryNotifiedMs";
      };
      const ipReady: IpReady[] = [
        {
          label: "Контроль",
          action: "ct",
          readyAt: u.solePropControlReadyAt,
          latchKey: "lastIpControlBoundaryNotifiedMs",
        },
        {
          label: "Персонал",
          action: "st",
          readyAt: u.solePropStaffReadyAt,
          latchKey: "lastIpStaffBoundaryNotifiedMs",
        },
        {
          label: "Реклама",
          action: "ad",
          readyAt: u.solePropAdvertReadyAt,
          latchKey: "lastIpAdvertBoundaryNotifiedMs",
        },
      ];
      for (const item of ipReady) {
        // Только после первого использования (есть готовая граница КД).
        if (item.readyAt == null || item.readyAt <= 0) continue;
        if (now < item.readyAt) continue;
        if (latch[item.latchKey] === item.readyAt) continue;
        await pushNotify(
          token,
          tgId,
          chatId,
          "work",
          `ИП: <b>${item.label}</b> снова доступен.`,
          ipReadyNotifyKeyboard(item.action),
        );
        patchNotifyLatch(tgId, { [item.latchKey]: item.readyAt });
      }
    }

    if (u.lastTrainAt) {
      const trainBoundary = u.lastTrainAt + ECONOMY_TRAIN_COOLDOWN_MS;
      const trainReady = now >= trainBoundary;
      if (trainReady && latch.lastTrainBoundaryNotifiedMs !== trainBoundary) {
        const member = await resolveMember(client, link.guildId, link.discordUserId);
        const skKb = member ? skillsKeyboard(member) : skillsKeyboardForUser(u);
        await pushNotify(token, tgId, chatId, "train", economyFormatSkillsNotify(u), skKb);
        patchNotifyLatch(tgId, { lastTrainBoundaryNotifiedMs: trainBoundary });
      }
    }
  }
}

function parseCommand(text: string): { cmd: string; args: string[] } {
  const t = text.trim();
  const m = t.match(/^\/([a-zA-Z0-9_]+)(?:@[\w]+)?(?:\s+([\s\S]*))?$/);
  if (!m) return { cmd: "", args: [] };
  const rest = (m[2] ?? "").trim();
  return { cmd: (m[1] ?? "").toLowerCase(), args: rest ? rest.split(/\s+/) : [] };
}

export function startTelegramSidecar(client: Client): void {
  if (!isTelegramBridgeConfigured()) {
    console.log("Telegram: выключен (нет TELEGRAM_BOT_TOKEN в .env).");
    return;
  }
  const token = telegramBotToken()!;
  const restrict = telegramAllowedUserIds().size > 0;
  console.log(`Telegram: long poll + панели${restrict ? " (whitelist)" : ""}.`);

  runBackground("deleteWebhook", () => tgApi(token, "deleteWebhook", { drop_pending_updates: true }));
  runBackground("registerBotCommands", () => registerBotCommands(token));

  setInterval(() => {
    runBackground("tickNotifications", () => tickNotifications(client, token));
  }, 45_000);
  runBackground("tickNotifications startup", () => tickNotifications(client, token));

  let offset = 0;
  const poll = async () => {
    try {
      const raw = (await tgApi(token, "getUpdates", {
        offset: offset ? offset + 1 : undefined,
        timeout: 45,
        allowed_updates: ["message", "callback_query"],
      })) as { ok?: boolean; result?: unknown[] };
      const updates = raw.result ?? [];
      for (const up of updates) {
        const u = up as { update_id: number; message?: TgMsg["message"]; callback_query?: TgCb };
        offset = Math.max(offset, u.update_id);
        const fromId = u.message?.from?.id ?? u.callback_query?.from.id;
        const tgUserId = fromId != null ? String(fromId) : "";
        const allowed = telegramAllowedUserIds();
        if (allowed.size > 0 && !allowed.has(tgUserId)) {
          if (u.message?.chat?.id) {
            await sendMessage(token, u.message.chat.id, "Бот закрыт списком TELEGRAM_ALLOWED_USER_IDS.");
          } else if (u.callback_query) {
            await answerCallback(token, u.callback_query.id, "Нет доступа.");
          }
          continue;
        }

        if (u.callback_query) {
          await routeCallback(client, token, tgUserId, u.callback_query);
          continue;
        }

        const msg = u.message;
        if (!msg?.text || !msg.chat?.id) continue;

        // Ожидание имени питомца / сумм ИП (не команда)
        const pending = getTelegramUiState(tgUserId).pendingInput;
        if (pending && !msg.text.startsWith("/")) {
          if (Date.now() > pending.expiresAtMs) {
            clearPendingInput(tgUserId);
            await sendMessage(token, msg.chat.id, "Время на ввод истекло. Открой экран снова.");
            continue;
          }
          if (pending.kind === "petRename") {
            const ctx = await requireLink(client, tgUserId, msg.chat.id, token);
            if (ctx) {
              clearPendingInput(tgUserId);
              const payload = handlePetRenameText(ctx.member, pending.uid, msg.text);
              await presentPanel(tgUserId, token, msg.chat.id, payload);
            }
            continue;
          }
          if (
            pending.kind === "ipDep" ||
            pending.kind === "ipWd" ||
            pending.kind === "ipCalc" ||
            pending.kind === "ipAd"
          ) {
            await handleIpAmountMessage(client, tgUserId, msg.chat.id, token, pending.kind, msg.text);
            continue;
          }
        }

        const { cmd, args } = parseCommand(msg.text);
        if (cmd === "start" || cmd === "help" || cmd === "menu") {
          clearPendingInput(tgUserId);
          const linked = getTelegramLink(tgUserId);
          if (linked) {
            await presentPanel(tgUserId, token, msg.chat.id, screenMain());
          } else {
            await presentPanel(tgUserId, token, msg.chat.id, {
              text: [
                "<b>Nash · Telegram</b>",
                "",
                "<code>/link КОД</code> — привязка (Discord → профиль → Telegram).",
                "После привязки — <b>Работа</b>, <b>Навыки</b> и <b>Магазин</b>.",
              ].join("\n"),
            });
          }
          continue;
        }
        if (cmd === "link") {
          if (!args[0]) {
            await presentPanel(tgUserId, token, msg.chat.id, {
              text: "Отправь: <code>/link КОД</code>\nКод — в Discord: профиль → Telegram.",
            });
            continue;
          }
          const codeRow = peekTelegramLinkCode(args[0]);
          if (!codeRow) {
            await presentPanel(tgUserId, token, msg.chat.id, {
              text: "Код недействителен или истёк. Запроси новый в Discord.",
            });
            continue;
          }
          const g = await client.guilds.fetch(codeRow.guildId).catch(() => null);
          if (!g) {
            await presentPanel(tgUserId, token, msg.chat.id, { text: "Сервер Discord недоступен боту." });
            continue;
          }
          removeTelegramLinkCode(args[0]);
          setTelegramLink(tgUserId, {
            guildId: codeRow.guildId,
            discordUserId: codeRow.discordUserId,
            linkedAtMs: Date.now(),
          });
          await presentPanel(tgUserId, token, msg.chat.id, screenMain());
          continue;
        }
        if (cmd === "work" || cmd === "w") {
          const ctx = await requireLink(client, tgUserId, msg.chat.id, token);
          if (ctx) await presentPanel(tgUserId, token, msg.chat.id, screenWork(ctx.member));
          continue;
        }
        if (cmd === "skills" || cmd === "sk") {
          const ctx = await requireLink(client, tgUserId, msg.chat.id, token);
          if (ctx) await presentPanel(tgUserId, token, msg.chat.id, screenSkills(ctx.member));
          continue;
        }
        if (cmd === "shop" || cmd === "s") {
          const ctx = await requireLink(client, tgUserId, msg.chat.id, token);
          if (ctx) await presentPanel(tgUserId, token, msg.chat.id, screenShopHub(ctx.member));
          continue;
        }
        if (cmd === "shift") {
          await handleShift(client, tgUserId, msg.chat.id, token);
          continue;
        }
        if (cmd === "train" && args[0]) {
          await handleTrain(client, tgUserId, msg.chat.id, token, args[0].toLowerCase() as SkillId);
          continue;
        }
        if (cmd === "status" || cmd === "st") {
          const ctx = await requireLink(client, tgUserId, msg.chat.id, token);
          if (ctx) await presentPanel(tgUserId, token, msg.chat.id, screenStatus(ctx.member));
          continue;
        }

      }
    } catch (e) {
      console.error("Telegram poll:", e);
    }
    setImmediate(() => void poll());
  };
  void poll();
}
