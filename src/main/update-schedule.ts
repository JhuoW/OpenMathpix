/** Automatic update checks: shortly after startup, then at most once a day. */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Let startup, models and the snip hotkey settle before contacting GitHub. */
export const FIRST_UPDATE_CHECK_DELAY_MS = 30_000;
/** How often a running copy (often in the tray for days) looks whether a check is due. */
export const UPDATE_CHECK_TICK_MS = 60 * 60 * 1000;

/** Due when enabled and no check has reached GitHub in the last day. */
export function updateCheckDue(
  now: number,
  lastCheck: number | undefined,
  enabled: boolean,
): boolean {
  if (!enabled) return false;
  if (lastCheck === undefined) return true;
  // A clock set back must not postpone checks until it catches up again.
  return now < lastCheck || now - lastCheck >= UPDATE_CHECK_INTERVAL_MS;
}

export interface UpdateScheduleOptions {
  enabled(): boolean;
  lastCheck(): number | undefined;
  /** Resolves true when GitHub answered, so a failed attempt is retried at the next tick. */
  check(): Promise<boolean>;
  record(time: number): void;
  now?: () => number;
  firstDelayMs?: number;
  tickMs?: number;
}

export interface UpdateSchedule {
  /** Check shortly, if due; for example after automatic checks were switched on. */
  checkSoon(): void;
  stop(): void;
}

export function scheduleUpdateChecks(options: UpdateScheduleOptions): UpdateSchedule {
  const now = options.now ?? Date.now;
  let running = false;
  let stopped = false;
  let soon: ReturnType<typeof setTimeout> | undefined;

  const run = async () => {
    if (stopped || running) return;
    if (!updateCheckDue(now(), options.lastCheck(), options.enabled())) return;
    running = true;
    try {
      if (await options.check()) options.record(now());
    } catch {
      // Offline or GitHub unavailable: try again at the next tick.
    } finally {
      running = false;
    }
  };

  const first = setTimeout(() => void run(), options.firstDelayMs ?? FIRST_UPDATE_CHECK_DELAY_MS);
  const tick = setInterval(() => void run(), options.tickMs ?? UPDATE_CHECK_TICK_MS);
  return {
    checkSoon() {
      clearTimeout(soon);
      soon = setTimeout(() => void run(), 5_000);
    },
    stop() {
      stopped = true;
      clearTimeout(first);
      clearTimeout(soon);
      clearInterval(tick);
    },
  };
}
