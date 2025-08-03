const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectHotkey: (hotkey) => ipcRenderer.send('hotkey-selected', hotkey),
  getAppTheme: async () => {
    const { resolvedTheme } = await ipcRenderer.invoke('get-app-theme');
    return resolvedTheme;
  },
  onUpdateTheme: (callback) => ipcRenderer.on('update-theme', (event, theme) => callback(theme)),
});
