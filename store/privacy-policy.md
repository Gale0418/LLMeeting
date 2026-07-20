# LLMeeting Privacy Policy

Last updated: 2026-07-17

LLMeeting is a local Chrome extension for coordinating a private multi-AI debate across AI web apps that you are already signed in to.

## Data the extension can access

When you use LLMeeting on supported AI pages, the extension can read and write chat content on:

- ChatGPT
- Gemini
- Grok
- Claude
- Meta AI, only when the user explicitly enables the Beta provider

This access is used to submit your prompt, collect AI replies, paste cross-critiques, and produce a final summary prompt.

## Data storage

LLMeeting stores only the latest debate state in Chrome local storage so the side panel can show progress, diagnostics, and transcript state. Stored debate content expires after 24 hours. If the plan-badge easter egg is used, LLMeeting also remembers the selected local 🐑 mode. Users can select `清除紀錄` in the side panel to remove the saved debate state and pending provider-page run records immediately.

LLMeeting 不會將資料送到 LLMeeting 開發者伺服器。LLMeeting also does not sell, share, or broker your chat content.

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
