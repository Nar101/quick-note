const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveToJournal: (content) => ipcRenderer.invoke('save-to-journal', content),
  closeWindow: () => ipcRenderer.send('close-window'),
});
