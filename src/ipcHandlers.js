// ipcHandlers.js
const { ipcMain, dialog, nativeTheme, shell } = require('electron');
const path = require('path');
const fs = require('fs');

function registerIpcHandlers(configManager, mainApp) {
    // Handler to get the current app theme.
    ipcMain.handle('get-app-theme', (event) => {
        const savedTheme = configManager.getTheme();
        const resolvedTheme = savedTheme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : savedTheme;
        return { savedTheme, resolvedTheme };
    });

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

    // Handler to get the primary monitor ID.
    ipcMain.handle('get-primary-monitor-id', () => mainApp.getPrimaryMonitorId());

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

        // Validate monitor selection for new profiles
        const validatedDisplay = mainApp.validateMonitorPosition(profileData.monitorId);
        const validatedData = { ...profileData, monitorId: validatedDisplay.id };

        const newProfile = configManager.addProfile(validatedData);
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
        
        // Validate monitor selection before updating
        const validatedDisplay = mainApp.validateMonitorPosition(updatedData.monitorId);
        const validatedData = { ...updatedData, monitorId: validatedDisplay.id };
        
        const updatedProfile = configManager.updateProfile(profileId, validatedData);

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

    // Handler to get the app version from package.json
    ipcMain.handle('get-app-version', () => {
        try {
            const packageJsonPath = path.join(__dirname, '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            return packageJson.version;
        } catch (error) {
            console.error('Failed to read package.json:', error);
            return '1.0.5'; // Fallback version
        }
    });

    // Handler to open external URL
    ipcMain.handle('open-external', async (event, url) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            console.error('Failed to open external URL:', error);
            return { success: false, error: 'Failed to open URL' };
        }
    });
}

module.exports = { registerIpcHandlers };
