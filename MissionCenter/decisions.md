# 決策紀錄

- 2026-06-05：快速鬥技場採用「先逐家啟用並送出，再逐家啟用收回」的 carousel scheduler，而不是完全背景並行。原因是 AI 網頁分頁在背景可能被 Chrome 節流，穩定性比理論極速更重要。
- 2026-06-05：移除 Mock Mode，因為目前專案已進入真實網頁自動化試玩階段，Mock 入口容易讓 UI 變複雜。
- 2026-06-05：總結辯論以目前 active provider tab 作為來源與最後裁判，其他勾選 provider 負責第一輪與互評。
- 2026-06-05：CodeRabbit review 暫停到主人明確同意第三方資料傳送後再執行。
- 2026-06-11：Free 版保留 ChatGPT/Gemini/Grok/Claude 四家 AI 基礎輪流辯論；快速鬥技場與總結辯論先列為 Pro 預留入口，不接付款後端。
- 2026-06-11：上架前 package zip 只收 manifest、assets、src；store listing、privacy policy、screenshot checklist 進 repo，但不打進商店 zip。
- 2026-06-14：快速鬥技場與總結辯論不再放外層兩顆醒目按鈕，改成進階辯論設定裡的互斥模式選項；外層主按鈕依選項切換行為。
- 2026-06-14：依主人要求，五連點 Free badge 的 Pro 解鎖保留為公開彩蛋並打進 Chrome Web Store zip。
