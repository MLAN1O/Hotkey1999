// ipcHandlers.js
const { ipcMain, dialog } = require('electron');

function registerIpcHandlers(configManager, mainApp) {
    // Handler to get the current app theme.
    ipcMain.handle('get-app-theme', (event) => configManager.getTheme());

    // Handler to set the app theme.
    ipcMain.handle('set-app-theme', (event, theme) => {
        configManager.setTheme(theme);
        // Optionally, notify all windows to update their theme
        mainApp.updateAllWindowThemes(theme);
    });

    // Handler to get all profiles.
    ipcMain.handle('get-profiles', () => configManager.getProfiles());

    // Handler to get all available displays.
    ipcMain.handle('get-available-displays', () => mainApp.getAvailableDisplays());

    // Handler to open the hotkey selection window.
    ipcMain.on('open-hotkey-window', (event, currentHotkey) => mainApp.createHotkeyWindow(currentHotkey));

    // Handler for when a hotkey is selected in the hotkey window.
    ipcMain.on('hotkey-selected', (event, hotkey) => {
        mainApp.sendHotkeyToConfigWindow(hotkey);
        mainApp.closeHotkeyWindow();
    });

    // Handler to add a new profile.
    ipcMain.handle('add-profile', (event, profileData) => {
        const { isDuplicate, conflictingProfile } = configManager.isHotkeyDuplicate(profileData.hotkey, null);
        if (isDuplicate) {
            return {
                success: false,
                error: `Hotkey is already in use by "${conflictingProfile}". Please choose another.`
            };
        }

        const newProfile = configManager.addProfile(profileData);
        if (newProfile) {
            mainApp.createProfileWindow(newProfile);
            mainApp.registerProfileShortcut(newProfile);
            return { success: true, profile: newProfile };
        } else {
            return { success: false, error: 'Failed to save the new profile.' };
        }
    });

    // Handler to update an existing profile.
    ipcMain.handle('update-profile', (event, profileId, updatedData) => {
        const { isDuplicate, conflictingProfile } = configManager.isHotkeyDuplicate(updatedData.hotkey, profileId);
        if (isDuplicate) {
            return {
                success: false,
                error: `Hotkey is already in use by "${conflictingProfile}". Please choose another.`
            };
        }

        const oldProfile = { ...configManager.getProfileById(profileId) };
        const updatedProfile = configManager.updateProfile(profileId, updatedData);

        if (updatedProfile) {
            mainApp.updateProfileWindow(profileId, oldProfile, updatedProfile);
            mainApp.updateProfileShortcut(oldProfile, updatedProfile);
            return { success: true, profile: updatedProfile };
        } else {
            return { success: false, error: 'Failed to update the profile.' };
        }
    });

    // Handler to delete a profile.
    ipcMain.handle('delete-profile', (event, profileId) => {
        const profileToDelete = configManager.getProfileById(profileId);
        if (profileToDelete && profileToDelete.hotkey) {
            mainApp.unregisterProfileShortcut(profileToDelete);
        }

        const success = configManager.deleteProfile(profileId);
        if (success) {
            mainApp.destroyProfileWindow(profileId);
            return { success: true };
        } else {
            return { success: false, error: 'Failed to delete the profile.' };
        }
    });
}

module.exports = { registerIpcHandlers };
