interface CloseDependencies {
  isQuitting(): boolean;
  isDestroyed(): boolean;
  hide(): void;
}

/** Close keeps background recognition alive; the native minimize button is untouched. */
export function createWindowCloseHandler(deps: CloseDependencies) {
  return (event: { preventDefault(): void }): void => {
    if (deps.isQuitting()) return;
    event.preventDefault();
    if (!deps.isDestroyed()) deps.hide();
  };
}
