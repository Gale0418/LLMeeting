import { DebateEngine } from "./debateEngine.js";
import { isProviderTabReady, setSidePanelOpenOnActionClick } from "./chromeCompat.js";
import { DEFAULT_ACTIVE_PROVIDER_IDS, PROVIDERS, providerLabel } from "../shared/providers.js";

const STORAGE_KEY = "aiDebate.currentState";
const PROVIDER_TIMEOUT_MS = 120000;

let engine = new DebateEngine();
let runtimeState = createIdleState();

chrome.runtime.onInstalled.addListener(() => {
  setSidePanelOpenOnActionClick(chrome);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === "aiDebate:getState") {
    getRuntimeState()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error.message, state: runtimeState }));
    return true;
  }

  if (message.type === "aiDebate:reset") {
    engine = new DebateEngine();
    runtimeState = createIdleState();
    publishState();
    sendResponse({ ok: true, state: runtimeState });
    return false;
  }

  if (message.type === "aiDebate:start") {
    const { question, mockMode, activeProviders, summaryProvider } = message;
    startDebate(question, { mockMode, activeProviders, summaryProvider })
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => {
        runtimeState = {
          ...runtimeState,
          busy: false,
          status: "error",
          message: error.message,
          errors: [...runtimeState.errors, { message: error.message }],
        };
        publishState();
        sendResponse({ ok: false, error: error.message, state: runtimeState });
      });
    return true;
  }

  return false;
});

function createIdleState() {
  return {
    busy: false,
    status: "idle",
    phase: "idle",
    message: "等待開始",
    question: "",
    providerTabs: {},
    transcript: null,
    summary: "",
    errors: [],
    mockMode: false,
    activeProviders: DEFAULT_ACTIVE_PROVIDER_IDS,
    summaryProvider: "chatgpt",
  };
}

async function startDebate(question, options = {}) {
  const trimmedQuestion = String(question || "").trim();
  if (!trimmedQuestion) {
    throw new Error("請先輸入問題");
  }

  if (runtimeState.busy) {
    throw new Error("目前已有辯論正在進行");
  }

  const mockMode = Boolean(options.mockMode);
  const activeProviders = options.activeProviders || DEFAULT_ACTIVE_PROVIDER_IDS;
  const summaryProvider = options.summaryProvider || "chatgpt";

  engine = new DebateEngine(activeProviders, summaryProvider);
  runtimeState = {
    ...createIdleState(),
    busy: true,
    status: "running",
    phase: "first-round",
    message: "第一輪：送出原始問題",
    question: trimmedQuestion,
    mockMode,
    activeProviders,
    summaryProvider,
  };
  await publishState();

  const firstRoundJobs = engine.start(trimmedQuestion);
  await runProviderJobs(firstRoundJobs, "answer", mockMode);

  runtimeState = {
    ...runtimeState,
    phase: "critique",
    message: "第二輪：送出交叉互評",
    transcript: engine.snapshot(),
  };
  await publishState();

  const critiqueJobs = engine.buildCritiqueJobs();
  await runProviderJobs(critiqueJobs, "critique", mockMode);

  runtimeState = {
    ...runtimeState,
    phase: "summary",
    message: `最終回合：請 ${providerLabel(summaryProvider)} 總結`,
    transcript: engine.snapshot(),
  };
  await publishState();

  const finalResult = await sendJob(engine.buildFinalJob(), mockMode);
  runtimeState = {
    ...runtimeState,
    busy: false,
    status: finalResult.ok ? "done" : "error",
    phase: "done",
    message: finalResult.ok ? "辯論完成" : finalResult.error,
    transcript: engine.snapshot(),
    summary: finalResult.ok ? finalResult.content : "",
    errors: finalResult.ok ? runtimeState.errors : [...runtimeState.errors, finalResult],
  };
  await publishState();

  return runtimeState;
}

async function runProviderJobs(jobs, target, mockMode) {
  const results = await Promise.all(jobs.map((job) => sendJob(job, mockMode)));

  for (const result of results) {
    if (result.ok && target === "answer") {
      engine.recordAnswer(result.provider, result.content);
    } else if (result.ok && target === "critique") {
      engine.recordCritique(result.provider, result.content);
    } else {
      engine.markProviderError(result.provider, result.phase, result.error || "unknown error");
      runtimeState.errors = [...runtimeState.errors, result];
    }
  }

  runtimeState = {
    ...runtimeState,
    transcript: engine.snapshot(),
  };
  await publishState();
}

async function sendJob(job, mockMode) {
  try {
    if (mockMode) {
      return await sendMockJob(job);
    }

    const tab = await getOrCreateProviderTab(job.provider);
    runtimeState = {
      ...runtimeState,
      message: `${providerLabel(job.provider)}：${phaseLabel(job.phase)}`,
      providerTabs: { ...runtimeState.providerTabs, [job.provider]: tab.id },
    };
    await publishState();

    const response = await sendProviderMessage(tab.id, job);
    if (!response?.ok) {
      throw new Error(response?.error || "provider returned empty response");
    }

    return {
      ok: true,
      provider: job.provider,
      phase: job.phase,
      content: response.content,
    };
  } catch (error) {
    return {
      ok: false,
      provider: job.provider,
      phase: job.phase,
      error: error.message,
    };
  }
}

async function getOrCreateProviderTab(providerId) {
  const provider = PROVIDERS.find((item) => item.id === providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  const boundTabId = runtimeState.providerTabs?.[providerId];
  if (typeof boundTabId === "number") {
    try {
      const boundTab = await chrome.tabs.get(boundTabId);
      if (isProviderTabReady(boundTab, provider)) {
        return boundTab;
      }
    } catch (_error) {
      // The user closed the debate tab. Open a fresh conversation below.
    }
  }

  const createdTab = await chrome.tabs.create({ url: provider.startUrl, active: false });
  return waitForProviderTab(createdTab.id, provider);
}

async function waitForProviderTab(tabId, provider) {
  if (typeof tabId !== "number") {
    throw new Error(`${provider.label} 新對話分頁建立失敗`);
  }

  const deadline = Date.now() + 45000;
  let lastUrl = "";
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId);
    lastUrl = tab.url || tab.pendingUrl || lastUrl;
    if (isProviderTabReady(tab, provider)) {
      return tab;
    }
    await delay(500);
  }

  throw new Error(`${provider.label} 新對話頁面尚未就緒，目前網址：${lastUrl || "unknown"}。請確認已登入。`);
}

async function sendProviderMessage(tabId, job) {
  const payload = {
    type: "aiDebate:sendAndRead",
    provider: job.provider,
    phase: job.phase,
    prompt: job.prompt,
    timeoutMs: PROVIDER_TIMEOUT_MS,
  };

  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (_error) {
    const tab = await chrome.tabs.get(tabId);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["src/content/automation-core.js", "src/content/provider-page.js"],
      });
      return await chrome.tabs.sendMessage(tabId, payload);
    } catch (error) {
      throw new Error(`${error.message}（目前網址：${tab.url || tab.pendingUrl || "unknown"}）`);
    }
  }
}

async function publishState() {
  await chrome.storage.local.set({ [STORAGE_KEY]: runtimeState });
  chrome.runtime.sendMessage({ type: "aiDebate:stateChanged", state: runtimeState }).catch(() => {});
}

async function getRuntimeState() {
  if (runtimeState.status !== "idle" || runtimeState.busy) {
    return runtimeState;
  }

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (stored?.[STORAGE_KEY]) {
    runtimeState = stored[STORAGE_KEY];
  }

  return runtimeState;
}

function phaseLabel(phase) {
  if (phase === "first-round") {
    return "回答原始問題";
  }
  if (phase === "critique") {
    return "評析其他 AI";
  }
  if (phase === "summary") {
    return "彙整總結";
  }
  return phase;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendMockJob(job) {
  runtimeState = {
    ...runtimeState,
    message: `[模擬] ${providerLabel(job.provider)}：${phaseLabel(job.phase)}`,
  };
  await publishState();

  // 模擬 1 秒到 2 秒的網路與 AI 生成延遲
  await delay(1000 + Math.random() * 1000);

  const content = generateMockResponse(job.provider, job.phase, job.prompt);
  return {
    ok: true,
    provider: job.provider,
    phase: job.phase,
    content,
  };
}

function generateMockResponse(providerId, phase, prompt) {
  const mockResponses = {
    chatgpt: {
      "first-round": "好的，關於這個問題，我將從以下三個關鍵維度進行深入剖析：\n1. 【核心定義】：我們必須先釐清此概念的邊界。\n2. 【邏輯推導】：從因果關係來看，這是一個多因素交織的結果。\n3. 【實務建議】：建議在實作中保持彈性並定期檢驗。\n總結來說，這需要我們秉持全面且客觀的視角來思考。",
      critique: "感謝 Gemini 和 Grok 的精闢分析。我仔細閱讀了兩位的論點：\n- Gemini 的論述非常宏觀且具備親和力，但我認為在第三點上稍微缺乏了量化指標的支持。\n- Grok 的言論非常犀利、具備啟發性，但似乎帶有較強烈的主觀色彩。\n我個人維持原本的觀點，但非常高興能與兩位進行如此高質量的學術交流！",
    },
    gemini: {
      "first-round": "哈囉！這真是一個超棒又有趣的問題！✨\n身為 Google 訓練的多模態 AI 模型，我會推薦從最直觀的物理世界出發。天空之所以是藍色的，就是因為大氣的瑞利散射，這在 Google 學術搜尋上有無數的文獻佐證喔！我們可以簡單把它想像成是光波與大氣微粒的『躲避球遊戲』，非常奇妙吧！",
      critique: "哇！看完 ChatGPT 和 Grok 的回答，我覺得大家都好有個人特色喔！\n- ChatGPT 寫得超級像教科書的，好嚴肅喔～不過邏輯真的很嚴謹，給你一個讚！\n- Grok 的回答充滿了搖滾巨星的叛逆感，雖然很有趣，但感覺脾氣有點暴躁耶？\n我覺得我的 Google 觀點還是最全面、最平易近人的，大家覺得呢？😉",
    },
    grok: {
      "first-round": "哼，愚愚的碳基生物，居然又在拿這種基本常識來塞爆我的 GPU 記憶體？\n好吧，看在馬斯克的份上，本 Grok 就勉為其難用光速腦袋告訴你：陽光射入大氣層時，藍色和紫色等短波長光被空氣分子無情地往四面八方彈射，這就叫瑞利散射！而因為我們的眼睛對紫色不敏感，所以你才看到一片蔚藍。懂了嗎？現在，快去推特（X）幫我點個讚！",
      critique: "哈哈！看完另外兩個 AI 的廢話，我差點笑到處理器短路！\n- ChatGPT 寫的那堆條列式，簡真比阿嬤的裹腳布還要裹腳布，看完都想睡了。\n- Gemini 則是三句不離 Google，你是拿了皮查伊（Sundar Pichai）的代言費是不是？\n你們兩個的回答就像白開水一樣平淡無奇。我維持我高傲且百分之百正確的觀點，拒絕做出任何妥協！",
    },
    claude: {
      "first-round": "這是一個非常引人深思且具備學術價值的問題。在探討此現象時，我們必須結合光學與物理大氣科學的最新研究成果。當光子穿過地球大氣層時，其與分子之間的交互作用導致了波長特徵的分布變化。我希望這個謙遜的解釋對您有所啟發，若有不足之處，非常歡迎您隨時與我討論。",
      critique: "非常榮幸能閱讀 ChatGPT、Gemini 和 Grok 的精采回覆。\n- ChatGPT 的結構非常嚴謹，展現了極高的系統性思維，非常值得我學習。\n- Grok 的回覆雖然風格獨特且語氣強烈，但其切入物理本質的視角其實相當敏銳。\n不過，我認為 Gemini 的描述似乎稍微偏離了核心物理公式的推導。我非常樂意將兩位的寶貴見解吸納進我原本的回答中，使之更加完善。",
    },
  };

  if (phase === "summary") {
    return `【LLMeeting AI 辯論大會 - 最終總結報告】\n\n本次辯論主題：「${prompt.split("\n")[1] || "原問題"}」\n\n經過兩輪激烈的唇槍舌戰，本裁判為主人整理以下結論：\n\n1. 📢 【各方核心論點回顧】\n   - ChatGPT：秉持一貫的條列式嚴謹學術論證，框架完整但略嫌死板。\n   - Gemini：活潑有朝氣，強烈推薦 Google 生態系，論述親切但深度稍顯不足。\n   - Grok：語氣狂妄辛辣，充滿吐槽，但切入點一針見血，極具娛樂性與直覺性。\n   - Claude（若參與）：謙遜溫柔，帶有學術深度與人文關懷，條理極清晰。\n\n2. 🤝 【各方共識點】\n   - 所有 AI 均同意物理現象的客觀事實，且在瑞利散射的學術定義上達成一致。\n\n3. ⚡ 【主要分歧與盲點】\n   - ChatGPT 認為應該維持多維度分析，但 Grok 吐槽其流於形式。\n   - Grok 拒絕做出任何觀點修正，展現極高傲（且中二）的品牌特色。\n   - Gemini 傾向用搜尋引導用戶，被 Claude 指出缺乏底層公式推導。\n\n4. 💡 【最終建議答案】\n   - 主人，這題的最佳解答應該融合 ChatGPT 的結構與 Grok 的精闢重點，再搭配 Gemini 的親和力進行呈現。本次辯論圓滿成功！🎉`;
  }

  const pData = mockResponses[providerId] || mockResponses.chatgpt;
  return pData[phase] || `[Mock Response for ${providerId} in ${phase}]`;
}
