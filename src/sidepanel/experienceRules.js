// User-facing guidance never displays untrusted Provider errors as instructions.
export function readinessRecovery(code) {
  const guidance = {
    LOGIN_REQUIRED: "開啟此 AI 網頁並登入，再重新檢查。LLMeeting 不會代你登入。",
    GENERATING: "此分頁仍在回答。等回答完成後重新檢查，不必再送一次問題。",
    INPUT_NOT_FOUND: "開啟此 AI 的聊天頁，確認輸入區已載入；若仍失敗，查看診斷資訊。",
    SEND_UNAVAILABLE: "確認聊天輸入區可使用、沒有遮住操作的視窗，再重新檢查。",
    WRONG_URL: "開啟此 AI 的聊天首頁，再重新檢查。",
    TAB_NOT_FOUND: "聊天分頁已關閉或無法存取。開啟此 AI 網頁後重新檢查。",
    CONTENT_SCRIPT_UNAVAILABLE: "確認擴充套件有此網站的存取權；更新套件後需重新載入，再檢查連線。",
    TIMEOUT: "頁面沒有及時回應。確認網路與聊天頁已載入，再重新檢查。",
    PROVIDER_ERROR: "此 AI 網頁顯示服務異常。先查看網頁上的提示；用量限制不會靠重試消失。",
  };
  return Object.hasOwn(guidance, code) ? guidance[code] : "先查看 AI 網頁與診斷資訊，排除問題後再檢查。不要重複送出同一題。";
}

export function launchGuide(mode) {
  const guidance = {
    chat: "各家先回答，接著等你插話。沒有回合上限，由你決定何時結案。",
    theater: "讓各家依人設回答與互評，再等你加入討論。可在設定中修改人設。",
    summary: "先整理目前 AI 分頁的對話，再交給其他參與者討論。請先切到要整理的分頁。",
  };
  return Object.hasOwn(guidance, mode) ? guidance[mode] : "各家先回答同一題，再互評與總結。第一次使用，維持預設設定就可以。";
}

export function hasMeetingContent(state) {
  return Boolean(state?.busy || state?.question || state?.summary || state?.reveal ||
    Object.values(state?.transcript?.answers || {}).some(Boolean));
}
