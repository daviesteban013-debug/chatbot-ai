const { contextBridge, ipcRenderer } = require('electron');
// A narrow bridge: no arbitrary IPC channel, URL, shell, filesystem or credentials.
if (window.top === window && window.location.origin === 'https://chatbot-ai-gold-two.vercel.app') {
  contextBridge.exposeInMainWorld('nexoDesktop', {
    surface: process.argv.includes('--nexo-surface=crm') ? 'crm' : 'bubble',
    getPreferences: () => ipcRenderer.invoke('nexo:preferences'),
    setColor: color => ipcRenderer.invoke('nexo:color', color),
    setExpanded: expanded => ipcRenderer.invoke('nexo:expanded', expanded),
    openPanel: path => ipcRenderer.invoke('nexo:panel', path),
    startGoogleSignIn: url => ipcRenderer.invoke('nexo:google', url),
    quit: () => ipcRenderer.invoke('nexo:quit'),
    onPreferences: callback => {
      const listener = (_event, preferences) => callback(preferences);
      ipcRenderer.on('nexo:preferences-changed', listener);
      return () => ipcRenderer.removeListener('nexo:preferences-changed', listener);
    },
  });
}
