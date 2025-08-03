// preload-config.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getProfiles: () => ipcRenderer.invoke('get-profiles'),
    getAvailableDisplays: () => ipcRenderer.invoke('get-available-displays'),
    addProfile: (profileData) => ipcRenderer.invoke('add-profile', profileData),
    updateProfile: (profileId, updatedData) => ipcRenderer.invoke('update-profile', profileId, updatedData),
    deleteProfile: (profileId) => ipcRenderer.invoke('delete-profile', profileId),
    openHotkeyWindow: (currentHotkey) => ipcRenderer.send('open-hotkey-window', currentHotkey),
    onHotkeyUpdate: (callback) => ipcRenderer.on('hotkey-updated', (event, value) => callback(value)),
});
