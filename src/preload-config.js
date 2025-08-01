// preload-config.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (settings) => ipcRenderer.invoke('save-config', settings),
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    openHotkeyWindow: () => ipcRenderer.send('open-hotkey-window'),
    onHotkeyUpdate: (callback) => ipcRenderer.on('hotkey-updated', (event, value) => callback(value)),
    // **NOVA LINHA: Adiciona a função para criar uma nova instância**
    // Retorna uma promessa que resolve com o resultado da operação de criação.
    createNewInstance: (settings) => ipcRenderer.invoke('create-new-instance', settings),
});