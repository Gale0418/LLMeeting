export class RunController {
  #generation = 0;
  #reservation = null;

  reserve() {
    if (this.#reservation !== null) {
      return null;
    }

    this.#generation += 1;
    this.#reservation = this.#generation;
    return this.#reservation;
  }

  isReserved() {
    return this.#reservation !== null;
  }

  claim(reservation) {
    if (this.#reservation !== reservation || !this.isCurrent(reservation)) {
      const error = new Error("已緊急暫停");
      error.code = "RUN_CANCELLED";
      throw error;
    }
    this.#reservation = null;
    return reservation;
  }

  release(reservation) {
    if (this.#reservation !== reservation) {
      return false;
    }
    this.#reservation = null;
    this.#generation += 1;
    return true;
  }

  start() {
    this.#generation += 1;
    this.#reservation = null;
    return this.#generation;
  }

  cancel() {
    this.#generation += 1;
    this.#reservation = null;
  }

  isCurrent(token) {
    return Boolean(token) && token === this.#generation;
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
