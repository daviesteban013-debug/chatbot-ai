export interface DesktopPreferences { color: string; expanded: boolean }
/** Zorax 0.2.5+: the watched folder (Descargas/Zorax) and what to do with a new file there. */
export interface WatchPreference { enabled: boolean; action: "ask" | "catalog_import" | "catalog_update" }
export type WatchFolder = "root" | "catalogo" | "stock";
export interface WatchedFileEvent { token: string; name: string; folder: WatchFolder; size: number }
export type ClipboardContent = { kind: "text"; text: string } | { kind: "image"; png: string } | { kind: "empty" };
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
  /** Zorax 0.2.4+: a system notification that opens the given CRM panel when clicked. */
  notify?(notice: { title: string; body: string; href?: string }): Promise<boolean>;
  /** Zorax 0.2.5+: what the person copied (text up to 8 000 characters or a PNG up to 3 MB). */
  readClipboard?(): Promise<ClipboardContent>;
  /** Zorax 0.2.5+: watched folder settings; files saved there arrive through onFileReady. */
  getWatch?(): Promise<WatchPreference>;
  setWatch?(preference: WatchPreference): Promise<WatchPreference>;
  openWatchFolder?(): Promise<void>;
  /** One-time token from onFileReady; the file bytes come base64 encoded. */
  readWatchedFile?(token: string): Promise<{ name: string; folder: WatchFolder; mime: string; base64: string }>;
  onFileReady?(callback: (event: WatchedFileEvent) => void): () => void;
}
declare global {
  interface Window { nexoDesktop?: NexoDesktop }
}
