# LLMeeting review scope
Review runtime logic, user interactions, packaging and meaningful regression tests,
including service-worker.js, app.js, provider-page.js and debateEngine.js.
Large source files are not assumed safe merely because of their size.
An isolated snapshot includes older unchanged source as additions. Paths and bytes
match the working tree. Binary assets, MissionCenter history, generated locale
metadata and ui-copy-catalog.js are omitted, but exist in the real project.
Their absence in this review snapshot is not a runtime missing-file defect.
Locale parameters and packaging are checked locally.
Prioritize correctness, privacy, accessibility and recovery defects.
Do not require live AI account credentials or send prompts as part of review.
Version 0.5.1 is a candidate; native side-panel acceptance remains pending.