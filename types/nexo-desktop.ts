export interface DesktopPreferences { color: string; expanded: boolean }
export interface DesktopUpdateState {
  status: "idle" | "checking" | "current" | "available" | "downloading" | "downloaded" | "installing" | "error";
  mode: "automatic" | "assisted" | "development";
  currentVersion: string;
  latestVersion?: string;
  progress?: number;
  message: string;
}
export interface NexoDesktop {
  surface?: "crm" | "bubble";
  getPreferences(): Promise<DesktopPreferences>;
  setColor(color: string): Promise<DesktopPreferences>;
  setExpanded(expanded: boolean): Promise<DesktopPreferences>;
  openPanel(path: string): Promise<void>;
  startGoogleSignIn(url: string): Promise<void>;
  quit(): Promise<void>;
  getUpdateState?(): Promise<DesktopUpdateState>;
  checkForUpdates?(): Promise<DesktopUpdateState>;
  downloadUpdate?(): Promise<DesktopUpdateState>;
  installUpdate?(): Promise<DesktopUpdateState>;
  onUpdateState?(callback: (state: DesktopUpdateState) => void): () => void;
  onPreferences(callback: (preferences: DesktopPreferences) => void): () => void;
  /** NEXO 0.2.4+: a system notification that opens the given CRM panel when clicked. */
  notify?(notice: { title: string; body: string; href?: string }): Promise<boolean>;
}
declare global {
  interface Window { nexoDesktop?: NexoDesktop }
}
