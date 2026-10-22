/** Public, versioned binary hosted separately from the Vercel web deployment. */
export const desktopRelease = {
  version: "0.3.2",
  filename: "NEXO-Setup-0.3.2.exe",
  url: "https://github.com/daviesteban013-debug/chatbot-ai/releases/download/nexo-desktop-v0.3.2/NEXO-Setup-0.3.2.exe",
  sizeLabel: "107 MB",
} as const;

export const macDesktopRelease = {
  version: "0.3.2",
  filename: "NEXO-0.3.2-mac-universal.dmg",
  url: "https://github.com/daviesteban013-debug/chatbot-ai/releases/download/nexo-desktop-v0.3.2/NEXO-0.3.2-mac-universal.dmg",
  systemLabel: "macOS 13+ · Apple Silicon e Intel",
} as const;
