import { pendingReplyRepairs } from "../shared/meetingRecovery.js";
import { PROVIDERS } from "../shared/providers.js";

const list = value => Array.isArray(value) ? value : [];
const providerIds = new Set(PROVIDERS.map(provider => provider.id));
const timestamp = value => Number.isFinite(value) && value > 0 && value <= 8640000000000000 ? value : null;

// Derive presentation from existing evidence; never infer successful recovery from a newer fault.
export function sessionHealth(state = {}) {
  const faults = list(state.debugEvents).slice(-100).map(event => ({ ...event, kind: "fault", at: timestamp(event.timestamp) }));
  const repairs = list(state.transcript?.manualRepairs).slice(-100).map(event => ({ ...event, kind: "repair", at: timestamp(event.repairedAt) }));
  const departures = list(state.departures || state.transcript?.departures).slice(-20).map(event => ({ ...event, kind: "departure", at: timestamp(event.departedAt) }));
  const departed = new Set([...list(state.departedProviders), ...list(state.transcript?.departedProviders), ...departures.map(event => event.provider)]);
  const providers = [...new Set([...list(state.activeProviders), state.sourceProvider, state.summaryProvider,
    ...departed, ...faults.map(event => event.provider), ...repairs.map(event => event.provider)])].filter(id => providerIds.has(id));
  const pending = pendingReplyRepairs(state);
  const headline = state.status === "error" || state.repairPause ? "已暫停，請先處理故障"
    : state.status === "done" ? "本場已完成"
      : state.status === "stopped" || (state.status === "idle" && state.message === "本次會議已停止，紀錄仍保留；可重新開始。") ? "本場已停止"
        : state.status === "waiting_for_user" ? "等待你的補充"
          : state.busy || state.status === "running" ? "討論進行中" : "等待開始";
  const events = [...faults, ...repairs, ...departures].filter(event => providerIds.has(event.provider))
    .sort((a, b) => (b.at ?? -1) - (a.at ?? -1)).slice(0, 100);
  return { headline, pending: pending.length, providers, departed, events, counts: { faults: faults.length, repairs: repairs.length, departures: departed.size } };
}

export function healthPhase(phase, translate) {
  if (phase === "first-round") return translate("第一輪");
  if (/^critique(?:-\d+)?$/.test(phase || "")) {
    return `${translate("交叉評析")} ${phase === "critique" ? 1 : Number(phase.slice(9))}`;
  }
  if (phase === "summary") return translate("最終裁決");
  if (phase === "source-summary") return translate("來源摘要");
  return ""; // Unknown driver phases remain available in technical details.
}

export function renderSessionHealth(root, state, { translate, locale, providerLabel }) {
  if (!root) return;
  const model = sessionHealth(state);
  const setText = (selector, value) => {
    const node = root.querySelector(selector);
    if (node.textContent !== value) node.textContent = value;
  };
  setText("#sessionHealthStatus", translate(model.headline));
  setText("#sessionHealthCounts", [
    `${translate("故障紀錄")} ${model.counts.faults}`,
    `${translate("手動補入")} ${model.counts.repairs}`,
    `${translate("離席")} ${model.counts.departures}`,
  ].join(" · "));
  setText("#sessionHealthHint", model.pending && state.repairPause
    ? `${translate("請到上方故障段落補入回覆，或讓 AI 離席。")} ${translate("全部故障補齊後會自動繼續。")}`
    : state.status === "error" ? translate("先查看 AI 網頁與診斷資訊，排除問題後再檢查。不要重複送出同一題。")
    : translate("已記錄的歷史，不代表目前仍故障"));
  const document = root.ownerDocument;
  const pendingProviders = new Set(pendingReplyRepairs(state).map(item => item.provider));
  const providerNodes = model.providers.map(id => {
    const node = document.createElement("li");
    const stage = state.providerDiagnostics?.[id]?.stage;
    const status = model.departed.has(id) ? "已離席" : pendingProviders.has(id) || stage === "error"
      ? "已記錄故障" : stage === "manual-recovered" ? "已手動補入" : stage === "received" ? "已完成" : state.busy ? "討論進行中" : model.headline;
    node.textContent = `${providerLabel(id)} · ${translate(status)}`;
    return node;
  });
  root.querySelector("#sessionHealthProviders").replaceChildren(...providerNodes);
  const eventNodes = model.events.map(event => {
    const item = document.createElement("li");
    item.dataset.kind = event.kind;
    const time = document.createElement("time");
    if (event.at) {
      time.dateTime = new Date(event.at).toISOString();
      time.textContent = new Intl.DateTimeFormat(locale === "zh_TW" ? "zh-TW" : locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(event.at);
      time.title = new Intl.DateTimeFormat(locale === "zh_TW" ? "zh-TW" : locale, { dateStyle: "short", timeStyle: "medium" }).format(event.at);
    } else time.textContent = translate("紀錄時間不明");
    const text = document.createElement("span");
    const action = { fault: "已記錄故障", repair: "已手動補入", departure: "已離席" }[event.kind];
    text.textContent = [providerLabel(event.provider), healthPhase(event.phase, translate), translate(action)].filter(Boolean).join(" · ");
    item.append(time, text);
    return item;
  });
  const timeline = root.querySelector("#sessionHealthTimeline");
  // No focusable children: preserve the disclosure nodes and user-selected open state.
  const previousScroll = timeline.scrollTop;
  timeline.replaceChildren(...eventNodes);
  timeline.scrollTop = previousScroll;
  setText("#sessionHealthEmpty", model.events.length ? "" : translate("目前沒有故障紀錄"));
}
