const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveToJournal: (content) => ipcRenderer.invoke('save-to-journal', content),
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedChange: (callback) => {
    ipcRenderer.send('window-maximized-subscribe');
    ipcRenderer.on('window-maximized-changed', (_, isMaximized) => callback(isMaximized));
  },
  onWindowShown: (callback) => {
    ipcRenderer.on('window-shown', () => callback());
  },
});
