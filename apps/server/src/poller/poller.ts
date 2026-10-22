export interface PollOutcome<T> {
  status: 'ok' | 'skipped' | 'error';
  result?: T;
  error?: string;
}

export interface Poller<T> {
  start(): void;
  stop(): void;
  runOnce(): Promise<PollOutcome<T>>;
}

export function createPoller<T>(opts: {
  intervalMs: number;
  runOnce: () => Promise<T>;
}): Poller<T> {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  // Run the work guarded against overlap. If a run is already in flight, skip.
  // Never rejects: returns a structured outcome so callers (API/UI) can report it.
  async function runGuarded(): Promise<PollOutcome<T>> {
    if (running) return { status: 'skipped' };
    running = true;
    try {
      const result = await opts.runOnce();
      return { status: 'ok', result };
    } catch (err) {
      console.error('[poller] runOnce failed:', err);
      return { status: 'error', error: err instanceof Error ? err.message : String(err) };
    } finally {
      running = false;
    }
  }

  return {
    start(): void {
      if (timer !== undefined) return;
      void runGuarded();
      timer = setInterval(() => {
        void runGuarded();
      }, opts.intervalMs);
      // The interval alone shouldn't keep the process alive (the HTTP server does);
      // optional-chained so it's a no-op under fake timers in tests.
      timer.unref?.();
    },
    stop(): void {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    },
    runOnce(): Promise<PollOutcome<T>> {
      return runGuarded();
    },
  };
}
