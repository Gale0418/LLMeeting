const DATABASE = "llmeeting-meeting";
const STATE = "state";
const EVENTS = "providerEvents";
const CURRENT = "current";
const SESSION = "sessionId";

// Keep one meeting, with full recovery state and an ordered provider log.
// Replacing the meeting or clearing it removes both in one transaction.
export function createMeetingArchive(indexedDB = globalThis.indexedDB) {
  let opening;

  function open() {
    opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STATE);
        request.result.createObjectStore(EVENTS, { autoIncrement: true });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = db.onclose = () => {
          db.close();
          opening = undefined;
        };
        resolve(db);
      };
    }).catch((error) => {
      opening = undefined;
      throw error;
    });
    return opening;
  }

  async function transact(stores, mode, run) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(stores, mode);
      let readResult;
      transaction.oncomplete = () => resolve(readResult?.());
      transaction.onabort = () => reject(transaction.error || new Error("會議儲存交易已中止"));
      try { readResult = run(transaction); }
      catch (error) { transaction.abort(); reject(error); }
    });
  }

  return {
    available: Boolean(indexedDB),
    load() {
      return transact([STATE], "readonly", (transaction) => {
        const request = transaction.objectStore(STATE).get(CURRENT);
        return () => request.result;
      });
    },
    save(state, providerEvents = []) {
      return transact([STATE, EVENTS], "readwrite", (transaction) => {
        const states = transaction.objectStore(STATE);
        const events = transaction.objectStore(EVENTS);
        const previous = states.get(SESSION);
        previous.onsuccess = () => {
          const sessionId = state.transcript?.sessionId || null;
          if (previous.result !== sessionId) events.clear();
          states.put(state, CURRENT);
          states.put(sessionId, SESSION);
          if (sessionId) for (const event of providerEvents) events.add(event);
        };
      });
    },
    readEvents(sessionId) {
      return transact([STATE, EVENTS], "readonly", (transaction) => {
        const state = transaction.objectStore(STATE).get(SESSION);
        let events;
        state.onsuccess = () => {
          if (state.result === sessionId) events = transaction.objectStore(EVENTS).getAll();
        };
        return () => events?.result ?? [];
      });
    },
    clear() {
      return transact([STATE, EVENTS], "readwrite", (transaction) => {
        transaction.objectStore(STATE).clear();
        transaction.objectStore(EVENTS).clear();
      });
    },
  };
}

export function buildMeetingExport(state, providerEvents, status, version, now = Date.now()) {
  return {
    schemaVersion: 1,
    version,
    exportedAt: new Date(now).toISOString(),
    status: state.status,
    phase: state.phase,
    mode: state.mode,
    transcript: state.transcript,
    summaries: state.summaries,
    sourceSummary: state.sourceSummary,
    summary: state.summary,
    ...(state.summaryStale ? { summaryStale: true } : {}),
    reveal: state.reveal,
    providerEvents,
    completeness: {
      legacy: state.archiveLegacy === true,
      durablySaved: status === "saved",
      providerEventsComplete: status === "saved" && state.archiveLegacy !== true,
    },
  };
}
