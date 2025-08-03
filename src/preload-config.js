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
    getAppTheme: () => ipcRenderer.invoke('get-app-theme'),
    setAppTheme: (theme) => ipcRenderer.invoke('set-app-theme', theme),
    onUpdateTheme: (callback) => ipcRenderer.on('update-theme', (event, theme) => callback(theme)),
});
