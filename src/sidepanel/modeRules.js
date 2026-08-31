export function isInteractiveDebateMode(mode) {
  return mode === "chat" || mode === "theater" || mode === "summary";
}

export function isCritiquePhase(phase) {
  return phase === "critique" || /^critique-\d+$/.test(String(phase || ""));
}

export function shouldShowChatControls(mode, state) {
  return isInteractiveDebateMode(mode)
    || (state?.phase === "waiting_for_user" && isInteractiveDebateMode(state.mode));
}
