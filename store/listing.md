# LLMeeting

LLMeeting 是一個 Chrome 側邊欄工具，可以把同一個問題交給 ChatGPT、Gemini、Grok、Claude，收集回答後再讓它們互評，最後由指定 AI 做總結。

## Short description

Host a private multi-AI debate from your Chrome side panel.

## Detailed description

LLMeeting helps you compare answers from multiple AI web apps without manually copying every reply. Open the side panel, choose participating providers, enter a question, and let the extension coordinate a debate flow across your logged-in AI tabs.

Free features:

- Four-provider basic debate with ChatGPT, Gemini, Grok, and Claude.
- Provider selection and summary judge selection.
- Bubble-style transcript and provider diagnostics.
- Local Chrome storage for the latest session state.

Planned Pro entries:

- Fast arena scheduling.
- Summarize the current AI conversation and send it to the other providers.
- Export and history.

## Test instructions

1. Install the unpacked extension.
2. Sign in to ChatGPT, Gemini, Grok, and Claude in Chrome.
3. Open the LLMeeting side panel from the toolbar icon.
4. Enter a short question such as `天為什麼是藍的？`.
5. Run 基礎辯論 and confirm each provider receives the prompt, replies, critiques, and final summary prompt.
6. Click 快速鬥技場 and 總結辯論 while on Free; they should show a Pro locked message without sending prompts.

## Permissions rationale

- `sidePanel`: show the LLMeeting control panel.
- `storage`: keep the latest local debate state and future entitlement state.
- `tabs`: find or open provider tabs.
- `scripting`: reinject the content script when a provider page is already open.
- Host permissions for ChatGPT, Gemini, Grok, X Grok, and Claude: automate prompt entry and read replies only on supported AI web apps.
