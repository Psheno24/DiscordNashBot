import type { Client, GuildMember } from "discord.js";
import {
  canWorkNow,
  economyFormatJobCardScreen,
  economyFormatJobListScreen,
  economyFormatSkillsNotify,
  economyFormatSkillsScreen,
  economyFormatWorkMenuScreen,
  economyIsWorkJobId,
  economyJobTitle,
  economyQuitJob,
  economyRunTrainSkill,
  economyRunWorkShift,
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

type TgMsg = { message?: { chat: { id: number }; text?: string; from?: { id: number } } };
type TgCb = {
  id: string;
  data?: string;
  from: { id: number };
  message?: { chat: { id: number }; message_id: number };
};

type InlineBtn = { text: string; callback_data: string };
type InlineKb = { inline_keyboard: InlineBtn[][] };

type TgApiResult = { ok?: boolean; result?: { message_id?: number } };

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
      { command: "shift", description: "Выйти на смену" },
      { command: "train", description: "Тренировка (communication|logistics|discipline)" },
      { command: "status", description: "Статус работы и навыков" },
      { command: "link", description: "Привязка Discord (код из профиля)" },
      { command: "help", description: "Справка" },
    ],
  });
}

function fmtMs(ms: number): string {
  const m = Math.ceil(ms / 60000);
  if (m >= 1440) return `${Math.floor(m / 1440)} д ${Math.floor((m % 1440) / 60)} ч`;
  if (m >= 60) return `${Math.floor(m / 60)} ч ${m % 60} мин`;
  return `${m} мин`;
}

function workReadyBoundaryMs(u: ReturnType<typeof getEconomyUser>, jobId: JobId, now: number): number {
  const last = lastWorkAtForJob(u, jobId);
  const cd = effectiveShiftCooldownMs(u, jobId, now);
  return last + cd;
}

function formatDelta(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const s = rounded.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  return n >= 0 ? `+${s} ₽` : `${s} ₽`;
}

function row(...buttons: InlineBtn[]): InlineBtn[] {
  return buttons;
}

function kb(...rows: InlineBtn[][]): InlineKb {
  return { inline_keyboard: rows };
}

function mainMenuKeyboard(): InlineKb {
  return kb(
    row({ text: "Работа", callback_data: "w" }, { text: "Навыки", callback_data: "sk" }),
    row({ text: "Статус", callback_data: "st" }),
  );
}

function workMenuKeyboard(member: GuildMember): InlineKb {
  const u = getEconomyUser(member.guild.id, member.id);
  const rows: InlineBtn[][] = [
    row(
      { text: "Начальные (т1)", callback_data: "wt1" },
      { text: "С навыком (т2)", callback_data: "wt2" },
    ),
    row({ text: "Продвинутые (т3)", callback_data: "wt3" }),
  ];
  if (u.jobId) {
    const now = Date.now();
    const st = u.jobId !== "soleProp" ? canWorkNow(u, u.jobId, now) : { ok: false, msLeft: 0 };
    const actions: InlineBtn[] = [{ text: `Моя: ${economyJobTitle(u.jobId).slice(0, 12)}`, callback_data: `j:${u.jobId}` }];
    if (u.jobId !== "soleProp") {
      actions.unshift({
        text: st.ok ? "Выйти на смену" : `Смена (${fmtMs(st.msLeft)})`,
        callback_data: "sh",
      });
    }
    rows.unshift(row(...actions));
  }
  rows.push(row({ text: "Главное меню", callback_data: "m" }));
  return kb(...rows);
}

function tierListKeyboard(tier: "t1" | "t2" | "t3"): InlineKb {
  const jobs = listWorkJobsByTier(tier);
  const rows: InlineBtn[][] = [];
  for (const id of jobs) {
    const title = economyJobTitle(id);
    rows.push(row({ text: title.slice(0, 28), callback_data: `j:${id}` }));
  }
  rows.push(row({ text: "← Работа", callback_data: "w" }, { text: "Меню", callback_data: "m" }));
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
    if (jobId !== "soleProp") {
      const st = canWorkNow(u, jobId, now);
      rows.push(
        row(
          { text: st.ok ? "Выйти на смену" : `КД ${fmtMs(st.msLeft)}`, callback_data: "sh" },
          { text: "Уволиться", callback_data: "q" },
        ),
      );
    } else {
      const st = canWorkNow(u, jobId, now);
      rows.push(row({ text: "Уволиться", callback_data: "q" }));
      void st;
    }
  } else {
    rows.push(row({ text: "Выбрать", callback_data: `t:${jobId}` }));
  }

  rows.push(row({ text: "← Каталог", callback_data: backTier }, { text: "Работа", callback_data: "w" }));
  rows.push(row({ text: "Главное меню", callback_data: "m" }));
  return kb(...rows);
}

function switchConfirmKeyboard(jobId: JobId): InlineKb {
  return kb(
    row({ text: "Да, сменить работу", callback_data: `ty:${jobId}` }),
    row({ text: "Отмена", callback_data: `j:${jobId}` }),
  );
}

function quitConfirmKeyboard(): InlineKb {
  return kb(row({ text: "Да, уволиться", callback_data: "qy" }, { text: "Отмена", callback_data: "w" }));
}

function skillsKeyboard(member: GuildMember): InlineKb {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const ready = !u.lastTrainAt || now >= u.lastTrainAt + ECONOMY_TRAIN_COOLDOWN_MS;
  const trainRow = row(
    { text: ready ? "Коммуникация" : "КД…", callback_data: "tr:communication" },
    { text: ready ? "Логистика" : "КД…", callback_data: "tr:logistics" },
  );
  const trainRow2 = row({ text: ready ? "Дисциплина" : "КД…", callback_data: "tr:discipline" });
  return kb(trainRow, trainRow2, row({ text: "Работа", callback_data: "w" }, { text: "Меню", callback_data: "m" }));
}

function shiftNotifyKeyboard(): InlineKb {
  return kb(row({ text: "Выйти на смену", callback_data: "sh" }, { text: "Работа", callback_data: "w" }));
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

type ScreenPayload = { text: string; markup?: InlineKb };

function screenMain(): ScreenPayload {
  return {
    text: "<b>Nash · терминал</b>\n\nРабота и навыки — как в Discord-терминале.",
    markup: mainMenuKeyboard(),
  };
}

function screenWork(member: GuildMember): ScreenPayload {
  return { text: economyFormatWorkMenuScreen(member), markup: workMenuKeyboard(member) };
}

function screenTier(tier: "t1" | "t2" | "t3"): ScreenPayload {
  return { text: economyFormatJobListScreen(tier), markup: tierListKeyboard(tier) };
}

function screenJob(member: GuildMember, jobId: JobId): ScreenPayload {
  return { text: economyFormatJobCardScreen(member, jobId), markup: jobCardKeyboard(member, jobId) };
}

function screenSkills(member: GuildMember): ScreenPayload {
  return { text: economyFormatSkillsScreen(member), markup: skillsKeyboard(member) };
}

function screenSwitchConfirm(currentTitle: string, newTitle: string, jobId: JobId): ScreenPayload {
  return {
    text: [
      "<b>Сменить работу?</b>",
      "",
      `Сейчас: <b>${currentTitle}</b>`,
      `Новая: <b>${newTitle}</b>`,
      "",
      "Текущая смена должна быть без КД.",
    ].join("\n"),
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
    line = st.ok ? `Смена (<b>${economyJobTitle(jid)}</b>): можно` : `Смена: КД ${fmtMs(st.msLeft)}`;
  } else if (jid === "soleProp") line = "ИП — смен нет, пассивный доход.";
  let tline = "Навыки: тренировка доступна";
  if (eu.lastTrainAt) {
    const left = eu.lastTrainAt + ECONOMY_TRAIN_COOLDOWN_MS - Date.now();
    tline = left > 0 ? `Навыки: КД ${fmtMs(left)}` : "Навыки: <b>можно</b>";
  }
  return {
    text: ["<b>Статус</b>", "", line, tline, "", economyFormatSkillsNotify(eu)].join("\n"),
    markup: mainMenuKeyboard(),
  };
}

function screenAfterShift(member: GuildMember, walletDeltaRub: number, notes: string[]): ScreenPayload {
  const header = [`<b>Смена:</b> ${formatDelta(walletDeltaRub)} к кошельку.`];
  if (notes.length) header.push("", ...notes.map((n) => `· ${n.replace(/\*\*/g, "")}`));
  return {
    text: [...header, "", economyFormatWorkMenuScreen(member)].join("\n"),
    markup: workMenuKeyboard(member),
  };
}

function screenAfterTrain(member: GuildMember, skillLabel: string, newLevel: number): ScreenPayload {
  return {
    text: [
      `<b>${skillLabel}</b> → уровень <b>${newLevel}</b>.`,
      "",
      economyFormatSkillsScreen(member),
    ].join("\n"),
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
    const msg = r.kind === "cooldown" ? "Смена на КД." : r.message.replace(/\*\*/g, "");
    if (ack) await answerCallback(token, ack.id, msg);
    await presentPanel(tgUserId, token, chatId, screenWork(ctx.member), { messageId });
    return;
  }
  if (ack) await answerCallback(token, ack.id, "Готово");
  await presentPanel(tgUserId, token, chatId, screenAfterShift(ctx.member, r.walletDeltaRub, r.notes), { messageId });
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
    if (ack) await answerCallback(token, ack.id, tr.kind === "unknown_skill" ? "Неверный навык" : "КД или максимум");
    await presentPanel(tgUserId, token, chatId, screenSkills(ctx.member), { messageId });
    return;
  }
  if (ack) await answerCallback(token, ack.id, "Готово");
  await presentPanel(tgUserId, token, chatId, screenAfterTrain(ctx.member, tr.skillLabel, tr.newLevel), { messageId });
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
      const body = economyFormatWorkMenuScreen(ctx.member);
      await presentPanel(tgUserId, token, chatId, {
        text: `<b>Не хватает навыков:</b>\n${r.missing.map((m) => `· ${m}`).join("\n")}\n\n${body}`,
        markup: workMenuKeyboard(ctx.member),
      }, { messageId });
      return;
    }
    if (r.kind === "need_housing") {
      if (ack) await answerCallback(token, ack.id, "Нужно жильё");
      const body = economyFormatWorkMenuScreen(ctx.member);
      await presentPanel(tgUserId, token, chatId, {
        text: "Сначала оформите <b>жильё</b> (аренда или квартира) в магазине терминала Discord — для работ тир 2+.\n\n" + body,
        markup: workMenuKeyboard(ctx.member),
      }, { messageId });
      return;
    }
    if (r.kind === "shift_cooldown") {
      if (ack) await answerCallback(token, ack.id, `КД ${fmtMs(r.msLeft)}`);
      await presentPanel(tgUserId, token, chatId, screenWork(ctx.member), { messageId });
      return;
    }
    if (r.kind === "confirm_switch") {
      await presentPanel(tgUserId, token, chatId, screenSwitchConfirm(r.currentTitle, r.newTitle, r.jobId), { messageId, ack });
      return;
    }
    return;
  }
  if (ack) await answerCallback(token, ack.id, r.kind === "already_current" ? "Уже эта работа" : "Принято");
  await presentPanel(tgUserId, token, chatId, screenJob(ctx.member, jobId), { messageId });
}

async function handleQuit(client: Client, tgUserId: string, chatId: number, token: string, confirm: boolean, ack?: TgCb, messageId?: number) {
  const ctx = await requireLink(client, tgUserId, chatId, token, ack);
  if (!ctx) return;
  if (!confirm) {
    await presentPanel(
      tgUserId,
      token,
      chatId,
      { text: "<b>Уволиться?</b>\n\nНельзя уволиться, пока идёт КД смены на текущей работе.", markup: quitConfirmKeyboard() },
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

async function routeCallback(
  client: Client,
  token: string,
  tgUserId: string,
  cq: TgCb,
): Promise<void> {
  const data = cq.data ?? "";
  const chatId = cq.message?.chat.id ?? Number(tgUserId);
  const messageId = cq.message?.message_id;

  if (data === "m") {
    await presentPanel(tgUserId, token, chatId, screenMain(), { messageId, ack: cq });
    return;
  }
  if (data === "w") {
    const ctx = await requireLink(client, tgUserId, chatId, token, cq);
    if (!ctx) return;
    await presentPanel(tgUserId, token, chatId, screenWork(ctx.member), { messageId, ack: cq });
    return;
  }
  if (data === "wt1" || data === "wt2" || data === "wt3") {
    const tier = data === "wt1" ? "t1" : data === "wt2" ? "t2" : "t3";
    await presentPanel(tgUserId, token, chatId, screenTier(tier), { messageId, ack: cq });
    return;
  }
  if (data === "sk") {
    const ctx = await requireLink(client, tgUserId, chatId, token, cq);
    if (!ctx) return;
    await presentPanel(tgUserId, token, chatId, screenSkills(ctx.member), { messageId, ack: cq });
    return;
  }
  if (data === "sh") {
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
  if (data === "shift") {
    await handleShift(client, tgUserId, chatId, token, cq, messageId);
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

function skillsKeyboardForUser(u: ReturnType<typeof getEconomyUser>): InlineKb {
  const now = Date.now();
  const ready = !u.lastTrainAt || now >= u.lastTrainAt + ECONOMY_TRAIN_COOLDOWN_MS;
  return kb(
    row(
      { text: ready ? "Коммуникация" : "КД…", callback_data: "tr:communication" },
      { text: ready ? "Логистика" : "КД…", callback_data: "tr:logistics" },
    ),
    row({ text: ready ? "Дисциплина" : "КД…", callback_data: "tr:discipline" }),
    row({ text: "Работа", callback_data: "w" }, { text: "Меню", callback_data: "m" }),
  );
}

function parseCommand(text: string): { cmd: string; args: string[] } {
  const t = text.trim();
  const m = t.match(/^\/([a-zA-Z0-9_]+)(?:\s+([\s\S]*))?$/);
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

  void tgApi(token, "deleteWebhook", { drop_pending_updates: true });
  void registerBotCommands(token);

  setInterval(() => {
    void tickNotifications(client, token);
  }, 45_000);
  void tickNotifications(client, token);

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
        const { cmd, args } = parseCommand(msg.text);
        if (cmd === "start" || cmd === "help" || cmd === "menu") {
          const linked = getTelegramLink(tgUserId);
          if (linked) {
            await presentPanel(tgUserId, token, msg.chat.id, screenMain());
          } else {
            await presentPanel(tgUserId, token, msg.chat.id, {
              text: [
                "<b>Nash · Telegram</b>",
                "",
                "<code>/link КОД</code> — привязка (Discord → профиль → Telegram).",
                "После привязки — кнопки <b>Работа</b> и <b>Навыки</b>.",
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
          const row = peekTelegramLinkCode(args[0]);
          if (!row) {
            await presentPanel(tgUserId, token, msg.chat.id, {
              text: "Код недействителен или истёк. Запроси новый в Discord.",
            });
            continue;
          }
          const g = await client.guilds.fetch(row.guildId).catch(() => null);
          if (!g) {
            await presentPanel(tgUserId, token, msg.chat.id, { text: "Сервер Discord недоступен боту." });
            continue;
          }
          removeTelegramLinkCode(args[0]);
          setTelegramLink(tgUserId, { guildId: row.guildId, discordUserId: row.discordUserId, linkedAtMs: Date.now() });
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
