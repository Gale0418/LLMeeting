# Provider browser smoke matrix

Run these checks manually in a signed-in Chrome profile before each store release. Unit tests cannot guarantee third-party DOM selectors or streaming behavior.

| Provider | Send confirmed | Reply captured | Streaming ends once | Login/limit classified | Reload recovery |
| --- | --- | --- | --- | --- | --- |
| ChatGPT | ☐ | ☐ | ☐ | ☐ | ☐ |
| Gemini | ☐ | ☐ | ☐ | ☐ | ☐ |
| Claude | ☐ | ☐ | ☐ | ☐ | ☐ |
| Grok | ☐ | ☐ | ☐ | ☐ | ☐ |

Record the browser version, test date, provider URL, observed error code, and a redacted screenshot. Do not store account tokens, cookies, or conversation content in this repository.
