const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectHotkey: (hotkey) => ipcRenderer.send('hotkey-selected', hotkey)
});
