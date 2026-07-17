# Provider browser smoke matrix

Run these checks manually in a signed-in Chrome profile before each store release. Unit tests cannot guarantee third-party DOM selectors or streaming behavior.

| Provider | Send confirmed | Reply captured | Streaming ends once | Login/limit classified | Reload recovery |
| --- | --- | --- | --- | --- | --- |
| ChatGPT | ☐ | ☐ | ☐ | ☐ | ☐ |
| Gemini | ☐ | ☐ | ☐ | ☐ | ☐ |
| Claude | ☐ | ☐ | ☐ | ☐ | ☐ |
| Grok | ☐ | ☐ | ☐ | ☐ | ☐ |
| Meta AI Beta | ☐ | ☐ | ☐ | ☐ | ☐ |

Record the browser version, test date, provider URL, observed error code, and a redacted screenshot. Do not store account tokens, cookies, or conversation content in this repository.

Meta AI is opt-in and may be unavailable by account or region. Record `BETA_UNAVAILABLE` rather than treating regional unavailability as a regression in the stable four-provider flow.

For overload testing, verify that LLMeeting refreshes and resends at most three times. For quota or usage-limit testing, verify that it does not refresh and that the visible provider notice is quoted to the remaining AIs as service status rather than a formal answer.
