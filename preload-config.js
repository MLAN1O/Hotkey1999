const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (data) => ipcRenderer.send('save-config', data),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openHotkeyWindow: () => ipcRenderer.send('open-hotkey-window'),
  onHotkeyUpdate: (callback) => ipcRenderer.on('hotkey-updated', (event, value) => callback(value))
});
