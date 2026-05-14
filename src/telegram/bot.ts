import type { Client } from "discord.js";
import {
  canWorkNow,
  economyRunTrainSkill,
  economyRunWorkShift,
  effectiveShiftCooldownMs,
  ECONOMY_TRAIN_COOLDOWN_MS,
} from "../economy/panel.js";
import { getEconomyUser, lastWorkAtForJob, type SkillId } from "../economy/userStore.js";
import {
  getNotifyLatch,
  getTelegramLink,
  listLinkedTelegramUserIds,
  patchNotifyLatch,
  peekTelegramLinkCode,
  removeTelegramLinkCode,
  setTelegramLink,
} from "./bridgeStore.js";
import { isTelegramBridgeConfigured, telegramAllowedUserIds, telegramBotToken } from "./env.js";

type TgMsg = { message?: { chat: { id: number }; text?: string; from?: { id: number } } };
type TgCb = { id: string; data?: string; from: { id: number }; message?: { chat: { id: number }; message_id: number } };

function tgApi(token: string, method: string, body?: object): Promise<unknown> {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());
}

function fmtMs(ms: number): string {
  const m = Math.ceil(ms / 60000);
  if (m >= 1440) return `${Math.floor(m / 1440)} д ${Math.floor((m % 1440) / 60)} ч`;
  if (m >= 60) return `${Math.floor(m / 60)} ч ${m % 60} мин`;
  return `${m} мин`;
}

function workReadyBoundaryMs(u: ReturnType<typeof getEconomyUser>, jobId: Parameters<typeof canWorkNow>[1], now: number): number {
  const last = lastWorkAtForJob(u, jobId);
  const cd = effectiveShiftCooldownMs(u, jobId, now);
  return last + cd;
}

async function sendMessage(token: string, chatId: number, text: string, replyMarkup?: object) {
  await tgApi(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function answerCallback(token: string, callbackId: string, text?: string) {
  await tgApi(token, "answerCallbackQuery", { callback_query_id: callbackId, text: text?.slice(0, 200), show_alert: Boolean(text && text.length > 100) });
}

function formatDelta(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const s = rounded.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  return n >= 0 ? `+${s} ₽` : `${s} ₽`;
}

function workKeyboard() {
  return {
    inline_keyboard: [[{ text: "Выйти на смену", callback_data: "shift" }]],
  };
}

function skillsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Коммуникация", callback_data: "train:communication" },
        { text: "Логистика", callback_data: "train:logistics" },
      ],
      [{ text: "Дисциплина", callback_data: "train:discipline" }],
    ],
  };
}

async function resolveMember(client: Client, guildId: string, discordUserId: string) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;
  return guild.members.fetch({ user: discordUserId, force: false }).catch(() => null);
}

async function handleShift(client: Client, tgUserId: string, chatId: number, token: string, ack?: TgCb) {
  const link = getTelegramLink(tgUserId);
  if (!link) {
    if (ack) await answerCallback(token, ack.id, "Сначала /link …");
    else await sendMessage(token, chatId, "Сначала привяжи аккаунт: <code>/link КОД</code> из Discord.");
    return;
  }
  const member = await resolveMember(client, link.guildId, link.discordUserId);
  if (!member) {
    const t = "Не найден участник Discord (бот не видит сервер или участника).";
    if (ack) await answerCallback(token, ack.id, t);
    else await sendMessage(token, chatId, t);
    return;
  }
  const r = await economyRunWorkShift(client, member);
  if (!r.ok) {
    const msg = r.kind === "cooldown" ? "Смена пока на КД." : r.message;
    if (ack) await answerCallback(token, ack.id, msg);
    else await sendMessage(token, chatId, msg);
    return;
  }
  const lines = [`Смена: <b>${formatDelta(r.walletDeltaRub)}</b> к кошельку.`];
  if (r.notes.length) lines.push("", ...r.notes.map((n) => `· ${n}`));
  const text = lines.join("\n");
  if (ack) {
    await answerCallback(token, ack.id, "Готово");
    await sendMessage(token, chatId, text);
  } else await sendMessage(token, chatId, text);
}

async function handleTrain(
  client: Client,
  tgUserId: string,
  chatId: number,
  token: string,
  skillId: SkillId,
  ack?: TgCb,
) {
  const link = getTelegramLink(tgUserId);
  if (!link) {
    if (ack) await answerCallback(token, ack.id, "Сначала /link …");
    else await sendMessage(token, chatId, "Сначала привяжи аккаунт.");
    return;
  }
  const member = await resolveMember(client, link.guildId, link.discordUserId);
  if (!member) {
    const t = "Не найден участник Discord.";
    if (ack) await answerCallback(token, ack.id, t);
    else await sendMessage(token, chatId, t);
    return;
  }
  const tr = economyRunTrainSkill(member, skillId);
  if (!tr.ok) {
    const msg = tr.kind === "unknown_skill" ? "Неверный навык." : "КД или максимум уровня.";
    if (ack) await answerCallback(token, ack.id, msg);
    else await sendMessage(token, chatId, msg);
    return;
  }
  const text = `Навык <b>${tr.skillLabel}</b> → уровень <b>${tr.newLevel}</b>.`;
  if (ack) {
    await answerCallback(token, ack.id, "Готово");
    await sendMessage(token, chatId, text);
  } else await sendMessage(token, chatId, text);
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
        await sendMessage(token, chatId, "Можно выйти на <b>смену</b>.", workKeyboard());
        patchNotifyLatch(tgId, { lastWorkBoundaryNotifiedMs: boundary });
      }
    }

    if (u.lastTrainAt) {
      const trainBoundary = u.lastTrainAt + ECONOMY_TRAIN_COOLDOWN_MS;
      const trainReady = now >= trainBoundary;
      if (trainReady && latch.lastTrainBoundaryNotifiedMs !== trainBoundary) {
        await sendMessage(token, chatId, "Можно потренировать <b>навык</b>.", skillsKeyboard());
        patchNotifyLatch(tgId, { lastTrainBoundaryNotifiedMs: trainBoundary });
      }
    }
  }
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
  console.log(`Telegram: long poll + напоминания${restrict ? " (whitelist)" : " (все пользователи)"}.`);

  void tgApi(token, "deleteWebhook", { drop_pending_updates: true });

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
            await sendMessage(token, u.message.chat.id, "Этот бот закрыт списком доступа (TELEGRAM_ALLOWED_USER_IDS).");
          } else if (u.callback_query) {
            await answerCallback(token, u.callback_query.id, "Нет доступа.");
          }
          continue;
        }

        if (u.callback_query) {
          const cq = u.callback_query;
          const chatId = cq.message?.chat.id ?? Number(tgUserId);
          if (cq.data === "shift") {
            await handleShift(client, tgUserId, chatId, token, cq);
          } else if (cq.data?.startsWith("train:")) {
            const sid = cq.data.slice("train:".length) as SkillId;
            await handleTrain(client, tgUserId, chatId, token, sid, cq);
          } else await answerCallback(token, cq.id);
          continue;
        }

        const msg = u.message;
        if (!msg?.text || !msg.chat?.id) continue;
        const { cmd, args } = parseCommand(msg.text);
        if (cmd === "start" || cmd === "help") {
          await sendMessage(
            token,
            msg.chat.id,
            [
              "<b>Nash терминал (TG)</b>",
              "",
              "<code>/link КОД</code> — привязка (код в Discord → профиль → Telegram).",
              "<code>/shift</code> — смена.",
              "<code>/train communication|logistics|discipline</code> — навык.",
            ].join("\n"),
          );
          continue;
        }
        if (cmd === "link" && args[0]) {
          const row = peekTelegramLinkCode(args[0]);
          if (!row) {
            await sendMessage(token, msg.chat.id, "Код недействителен или истёк. Запроси новый в Discord.");
            continue;
          }
          const g = await client.guilds.fetch(row.guildId).catch(() => null);
          if (!g) {
            await sendMessage(token, msg.chat.id, "Сервер Discord недоступен боту.");
            continue;
          }
          removeTelegramLinkCode(args[0]);
          setTelegramLink(tgUserId, { guildId: row.guildId, discordUserId: row.discordUserId, linkedAtMs: Date.now() });
          await sendMessage(token, msg.chat.id, "Привязано. Уведомления о смене и навыках включены.");
          continue;
        }
        if (cmd === "shift") {
          await handleShift(client, tgUserId, msg.chat.id, token);
          continue;
        }
        if (cmd === "train" && args[0]) {
          const sid = args[0].toLowerCase() as SkillId;
          await handleTrain(client, tgUserId, msg.chat.id, token, sid);
          continue;
        }
        if (cmd === "status") {
          const link = getTelegramLink(tgUserId);
          if (!link) {
            await sendMessage(token, msg.chat.id, "Не привязано.");
            continue;
          }
          const eu = getEconomyUser(link.guildId, link.discordUserId);
          const jid = eu.jobId;
          let line = "Работа: нет";
          if (jid && jid !== "soleProp") {
            const st = canWorkNow(eu, jid, Date.now());
            line = st.ok ? "Смена: <b>можно</b>" : `Смена: КД ещё ${fmtMs(st.msLeft)}`;
          } else if (jid === "soleProp") line = "ИП — смен нет.";
          let tline = "Навык: можно (или ещё не качали)";
          if (eu.lastTrainAt) {
            const left = eu.lastTrainAt + ECONOMY_TRAIN_COOLDOWN_MS - Date.now();
            tline = left > 0 ? `Навык: КД ${fmtMs(left)}` : "Навык: <b>можно</b>";
          }
          await sendMessage(token, msg.chat.id, [line, tline].join("\n"));
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
