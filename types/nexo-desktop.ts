export interface DesktopPreferences { color: string; expanded: boolean }
export interface NexoDesktop {
  surface?: "crm" | "bubble";
  getPreferences(): Promise<DesktopPreferences>;
  setColor(color: string): Promise<DesktopPreferences>;
  setExpanded(expanded: boolean): Promise<DesktopPreferences>;
  openPanel(path: string): Promise<void>;
  startGoogleSignIn(url: string): Promise<void>;
  quit(): Promise<void>;
  onPreferences(callback: (preferences: DesktopPreferences) => void): () => void;
}
declare global {
  interface Window { nexoDesktop?: NexoDesktop }
}
