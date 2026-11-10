import type { WebContents } from 'electron';

/** Only web links leave the app, and only through the system browser. */
export function externalLinkTarget(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** A reload of the current page (development hot reload) is not a navigation away. */
export function isSameDocument(target: string, current: string): boolean {
  try {
    const next = new URL(target);
    const page = new URL(current);
    return (
      next.protocol === page.protocol && next.host === page.host && next.pathname === page.pathname
    );
  } catch {
    return false;
  }
}

/**
 * The preload API exposes settings, including the access token, to every page loaded in
 * a window. Keep every window on the application's own pages; links in recognized
 * Markdown open in the default browser instead.
 */
export function guardNavigation(
  contents: WebContents,
  openExternal: (url: string) => Promise<void>,
): void {
  const open = (url: string) => {
    const target = externalLinkTarget(url);
    if (target) void openExternal(target).catch(() => undefined);
  };
  contents.setWindowOpenHandler(({ url }) => {
    open(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (isSameDocument(url, contents.getURL())) return;
    event.preventDefault();
    open(url);
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
}
