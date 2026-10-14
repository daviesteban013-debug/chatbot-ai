/** Public, versioned binary hosted separately from the Vercel web deployment. */
export const desktopRelease = {
  version: "0.2.4",
  filename: "NEXO-Setup-0.2.4.exe",
  url: "https://github.com/daviesteban013-debug/chatbot-ai/releases/download/nexo-desktop-v0.2.4/NEXO-Setup-0.2.4.exe",
  sizeLabel: "107 MB",
} as const;

export const macDesktopRelease = {
  version: "0.2.4",
  filename: "NEXO-0.2.4-mac-universal.dmg",
  url: "https://github.com/daviesteban013-debug/chatbot-ai/releases/download/nexo-desktop-v0.2.4/NEXO-0.2.4-mac-universal.dmg",
  systemLabel: "macOS 13+ · Apple Silicon e Intel",
} as const;
