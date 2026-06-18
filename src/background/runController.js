export class RunController {
  #generation = 0;

  start() {
    this.#generation += 1;
    return this.#generation;
  }

  cancel() {
    this.#generation += 1;
  }

  isCurrent(token) {
    return token === this.#generation;
  }

  assertCurrent(token) {
    if (this.isCurrent(token)) {
      return;
    }

    const error = new Error("已緊急暫停");
    error.code = "RUN_CANCELLED";
    throw error;
  }
}

export function isRunCancelledError(error) {
  return error?.code === "RUN_CANCELLED";
}
