const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectHotkey: (hotkey) => ipcRenderer.send('hotkey-selected', hotkey),
  getAppTheme: () => ipcRenderer.invoke('get-app-theme'),
  onUpdateTheme: (callback) => ipcRenderer.on('update-theme', (event, theme) => callback(theme)),
});
