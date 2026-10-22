import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPoller } from './poller';

describe('createPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('fires one runOnce immediately on start()', async () => {
    let count = 0;
    const poller = createPoller({
      intervalMs: 1000,
      runOnce: async () => {
        count += 1;
      },
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(count).toBe(1);

    poller.stop();
  });

  it('runs again after advancing time by intervalMs', async () => {
    let count = 0;
    const poller = createPoller({
      intervalMs: 1000,
      runOnce: async () => {
        count += 1;
      },
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(count).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(count).toBe(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(count).toBe(3);

    poller.stop();
  });

  it('stops scheduling further runs after stop()', async () => {
    let count = 0;
    const poller = createPoller({
      intervalMs: 1000,
      runOnce: async () => {
        count += 1;
      },
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(count).toBe(1);

    poller.stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(count).toBe(1);
  });

  it('does not start a second concurrent run when a tick fires mid-run', async () => {
    let started = 0;
    let resolveCurrent: (() => void) | undefined;

    const poller = createPoller({
      intervalMs: 1000,
      runOnce: () => {
        started += 1;
        return new Promise<void>((resolve) => {
          resolveCurrent = resolve;
        });
      },
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    // First run started but is still pending.
    expect(started).toBe(1);

    // A tick fires while the first run is still in-flight: must be skipped.
    await vi.advanceTimersByTimeAsync(1000);
    expect(started).toBe(1);

    // Another tick, still in-flight: still skipped.
    await vi.advanceTimersByTimeAsync(1000);
    expect(started).toBe(1);

    // Now let the first run finish.
    resolveCurrent?.();
    await vi.advanceTimersByTimeAsync(0);

    // The next tick after completion is allowed to run.
    await vi.advanceTimersByTimeAsync(1000);
    expect(started).toBe(2);

    poller.stop();
  });

  it('keeps the interval alive when runOnce rejects', async () => {
    let count = 0;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const poller = createPoller({
      intervalMs: 1000,
      runOnce: async () => {
        count += 1;
        throw new Error('boom');
      },
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(count).toBe(1);

    // Despite the rejection, the next tick still runs.
    await vi.advanceTimersByTimeAsync(1000);
    expect(count).toBe(2);

    expect(errorSpy).toHaveBeenCalled();

    poller.stop();
  });

  it('public runOnce() respects the overlap guard', async () => {
    let started = 0;
    let resolveCurrent: (() => void) | undefined;

    const poller = createPoller({
      intervalMs: 1000,
      runOnce: () => {
        started += 1;
        return new Promise<void>((resolve) => {
          resolveCurrent = resolve;
        });
      },
    });

    // Kick off a manual run that stays pending.
    const first = poller.runOnce();
    expect(started).toBe(1);

    // A concurrent manual call must be skipped (not started).
    await poller.runOnce();
    expect(started).toBe(1);

    resolveCurrent?.();
    await first;

    // After completion a fresh manual run is allowed.
    resolveCurrent = undefined;
    void poller.runOnce();
    expect(started).toBe(2);
    // Cleanup: resolve the second pending run (cast — TS narrows after the reassignment above).
    (resolveCurrent as (() => void) | undefined)?.();
  });
});
