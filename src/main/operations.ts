/** Track durable work so shutdown does not terminate an in-progress import or cache mutation. */
export function createOperationTracker() {
  let active = 0;
  const waiters = new Set<() => void>();
  return {
    async run<T>(operation: () => Promise<T>): Promise<T> {
      active++;
      try {
        return await operation();
      } finally {
        active--;
        if (active === 0) for (const finish of [...waiters]) finish();
      }
    },
    waitForIdle(timeoutMs = 12_000): Promise<boolean> {
      if (active === 0) return Promise.resolve(true);
      return new Promise((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          waiters.delete(finish);
          resolve(true);
        };
        const timer = setTimeout(() => {
          waiters.delete(finish);
          resolve(false);
        }, timeoutMs);
        waiters.add(finish);
      });
    },
  };
}
