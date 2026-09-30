/**
 * Bridge exposed by the Electron shell (apps/desktop/preload.cjs) when running as the desktop app.
 * All methods are optional so the same bundle runs in a normal browser too.
 */
export interface DesktopBridge {
  apiUrl?: string;
  platform: string;
  notify(title: string, body: string, link?: string | null): void;
  setBadge(count: number): void;
  onDeepLink(cb: (path: string) => void): () => void;
  setAlwaysOnTop?(on: boolean): void;
  openExternal?(url: string): void;
}

export const desktop: DesktopBridge | undefined =
  typeof window !== 'undefined' ? (window as unknown as { chatlolDesktop?: DesktopBridge }).chatlolDesktop : undefined;

export const isDesktop = !!desktop;
