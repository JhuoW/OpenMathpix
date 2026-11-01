export type CloseChoice = 'minimize' | 'quit' | 'cancel';

interface CloseDependencies {
  isQuitting(): boolean;
  isDestroyed(): boolean;
  ask(): Promise<CloseChoice>;
  minimize(): void;
  quit(): void;
  onError(error: unknown): void;
}

/** A window close is a choice; an explicit application quit bypasses the prompt. */
export function createWindowCloseHandler(deps: CloseDependencies) {
  let asking = false;
  return (event: { preventDefault(): void }): void => {
    if (deps.isQuitting()) return;
    event.preventDefault();
    if (asking || deps.isDestroyed()) return;
    asking = true;
    void (async () => {
      try {
        const choice = await deps.ask();
        // An explicit Quit or OS shutdown may have started while the dialog was open.
        if (deps.isQuitting() || deps.isDestroyed()) return;
        if (choice === 'minimize') deps.minimize();
        else if (choice === 'quit') deps.quit();
      } catch (error) {
        // A failed dialog keeps the window open and permits another close attempt.
        if (!deps.isQuitting() && !deps.isDestroyed()) deps.onError(error);
      } finally {
        asking = false;
      }
    })();
  };
}
