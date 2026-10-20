const { contextBridge, ipcRenderer } = require('electron');
// A narrow bridge: no arbitrary IPC channel, URL, shell, filesystem or credentials.
if (window.top === window && ['https://zoraxpilot.com', 'https://chatbot-ai-gold-two.vercel.app'].includes(window.location.origin)) {
  contextBridge.exposeInMainWorld('nexoDesktop', {
    surface: process.argv.includes('--nexo-surface=crm') ? 'crm' : 'bubble',
    getPreferences: () => ipcRenderer.invoke('nexo:preferences'),
    setColor: color => ipcRenderer.invoke('nexo:color', color),
    setExpanded: expanded => ipcRenderer.invoke('nexo:expanded', expanded),
    openPanel: path => ipcRenderer.invoke('nexo:panel', path),
    startGoogleSignIn: url => ipcRenderer.invoke('nexo:google', url),
    quit: () => ipcRenderer.invoke('nexo:quit'),
    notify: notice => ipcRenderer.invoke('nexo:notify', notice),
    readClipboard: () => ipcRenderer.invoke('nexo:clipboard'),
    getWatch: () => ipcRenderer.invoke('nexo:watch'),
    setWatch: preference => ipcRenderer.invoke('nexo:watch-set', preference),
    openWatchFolder: () => ipcRenderer.invoke('nexo:watch-open'),
    readWatchedFile: token => ipcRenderer.invoke('nexo:file-read', token),
    onFileReady: callback => {
      const listener = (_event, file) => callback(file);
      ipcRenderer.on('nexo:file-ready', listener);
      return () => ipcRenderer.removeListener('nexo:file-ready', listener);
    },
    getUpdateState: () => ipcRenderer.invoke('nexo:update-state'),
    checkForUpdates: () => ipcRenderer.invoke('nexo:update-check'),
    downloadUpdate: () => ipcRenderer.invoke('nexo:update-download'),
    installUpdate: () => ipcRenderer.invoke('nexo:update-install'),
    onUpdateState: callback => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('nexo:update-state', listener);
      return () => ipcRenderer.removeListener('nexo:update-state', listener);
    },
    onPreferences: callback => {
      const listener = (_event, preferences) => callback(preferences);
      ipcRenderer.on('nexo:preferences-changed', listener);
      return () => ipcRenderer.removeListener('nexo:preferences-changed', listener);
    },
  });
}
