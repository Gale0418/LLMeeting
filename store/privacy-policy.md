# LLMeeting Privacy Policy

Last updated: 2026-10-15

LLMeeting is a local Chrome extension for coordinating a private multi-AI debate across AI web apps that you are already signed in to.

## Data the extension can access

When you use LLMeeting on supported AI pages, the extension can read and write chat content on:

- ChatGPT
- Gemini
- Grok
- Claude
- Meta AI, only when the user explicitly enables the Beta provider

This access is used to submit your prompt, collect AI replies, paste cross-critiques, and produce a final summary prompt.

If you explicitly select existing conversation tabs, starting a meeting first reads the loaded, identifiable user and AI messages from those selected, participating providers. It combines that quoted context with your new input as Round 0 and shares it with the AI providers participating in the meeting. It does not load hidden history by scrolling, read unselected conversation tabs, or silently skip a selected tab that fails to load. Round 0 is part of the locally stored meeting transcript and has the same 24-hour retention limit. Diagnostic downloads omit conversation bodies.

## Data storage

LLMeeting stores the latest debate state in Chrome local storage so the side panel can show progress, diagnostics, and transcript state. Stored debate content expires after 24 hours. LLMeeting also saves your provider selection and UI language preference locally; if the plan-badge easter egg is used, it remembers the selected local 🐑 mode. These preferences persist independently of the debate content expiry. Users can select `清除紀錄` in the side panel to remove the saved debate state and pending provider-page run records immediately; this does not clear those preferences.

LLMeeting 不會將資料送到 LLMeeting 開發者伺服器。LLMeeting also does not sell, share, or broker your chat content.

The side panel saves your circuit background and animation choices in its own local storage. These appearance preferences persist until changed or the extension's local data is removed; clearing debate history does not reset them.

The UI language preference can be a manual language or “follow browser.” Automatic selection reads the browser's UI language (or preferred languages if that API is unavailable), with English as the fallback. Language detection stays local and does not transmit these preferences to the developer.

## Third-party AI services

Your prompts and quoted AI replies are sent only to the AI web apps you choose as part of the debate flow. Those providers process data according to their own terms and privacy policies. Meta AI may apply account- or region-specific personalization under Meta's policies when the user enables that Beta provider.

## Permissions

- `sidePanel`: displays the extension UI.
- `storage`: stores local state in your browser.
- `tabs`: opens or activates supported AI tabs.
- `scripting`: loads the automation content script into supported AI pages.
- Host permissions: limit automation to ChatGPT, Gemini, Grok, X Grok, Claude, and Meta AI pages.

## Contact

For support, use the Chrome Web Store support channel for this extension.
