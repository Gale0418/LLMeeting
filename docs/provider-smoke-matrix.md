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

For overload, quota or usage-limit testing, verify that LLMeeting shows the provider fault and pauses for manual repair without refreshing or resending. Already-submitted replies from other providers should still be collected. Verify that pasting the missing reply or departing the affected AI resumes only after all pending faults are handled; the original fault stays visible as diagnostic history and is not quoted as a formal AI answer.
