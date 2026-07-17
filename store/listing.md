# LLMeeting

LLMeeting 是一個 Chrome 側邊欄 AI 議事空間，可以把同一個問題交給 ChatGPT、Gemini、Grok、Claude，以及預設關閉的 Meta AI Beta。它不只並排回答，還會讓 AI 互相閱讀、質疑、扮演角色，並接受使用者中途插話。

## Short description

Host a private multi-AI debate from your Chrome side panel.

## Detailed description

LLMeeting helps you run an interactive debate across AI web apps you are already signed in to. Open the side panel, choose participants, enter a question, and let the extension coordinate answers, cross-critiques, optional user interjections, and a final chair summary.

Core features:

- Four-provider basic debate with ChatGPT, Gemini, Grok, and Claude.
- Optional Meta AI Beta participation; it stays disabled by default because availability and page structure may vary by account or region.
- One to five cross-critique rounds.
- Serious critique, casual chat, brawl, Yes-and, and imposter interaction styles.
- Provider selection, random chair, observer chair, and anonymous review strategies.
- Pro chat and theater modes with user interjections and custom personas.
- Bubble-style transcript and provider diagnostics.
- Fast arena scheduling.
- Summarize the current AI conversation and send it to the other providers.
- Local storage for the latest session only, with a 24-hour retention limit and an explicit clear-data control.

LLMeeting does not send chat content to an LLMeeting developer server. Prompts and quoted AI replies are submitted only to the AI websites selected by the user and are processed under those providers' own terms and privacy policies.

## Test instructions

1. Install the unpacked extension.
2. Sign in to ChatGPT, Gemini, Grok, and Claude in Chrome.
3. Optionally open Meta AI in a signed-in account; Meta AI Beta is not required for the stable four-provider flow.
4. Open the LLMeeting side panel from the toolbar icon.
5. Enter a short question such as `天為什麼是藍的？`.
6. Set 交叉評析輪次 to 2, run 基礎辯論, and confirm every selected provider receives the initial prompt and two critique prompts, and only the chair provider receives the final summary prompt.
7. Confirm Meta AI Beta is unchecked after a fresh install.
8. Click 清除紀錄 and confirm the transcript returns to an empty local state.

## Permissions rationale

- `sidePanel`: show the LLMeeting control panel.
- `storage`: keep the latest local debate state for up to 24 hours and remember the local author-mode easter egg preference.
- `tabs`: list provider tabs for an explicit connection choice, or open fresh provider tabs when none is selected.
- `scripting`: reinject the content script when a provider page is already open.
- Host permissions for ChatGPT, Gemini, Grok, X Grok, Claude, and Meta AI: automate prompt entry and read replies only on explicitly supported AI web apps. Meta AI remains opt-in in the side panel.
