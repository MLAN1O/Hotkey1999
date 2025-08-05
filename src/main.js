// main.js
const { app, BrowserWindow, globalShortcut, Menu, Tray, dialog, screen, nativeTheme } = require('electron');
const path = require('path');
const ConfigManager = require('./ConfigManager');
const { registerIpcHandlers } = require('./ipcHandlers');

/**
 * Main application class for HotkeyMyURL.
 * Manages multiple profiles, windows, and global hotkeys in a single instance.
 */
class MainApp {
    constructor() {
        this.configManager = new ConfigManager();
        this.profiles = [];
        this.profileWindows = new Map(); // <profileId, BrowserWindow>
        this.configWin = null;
        this.hotkeyWin = null;
        this.tray = null;
        this.isQuitting = false;
    }

    /**
     * Initializes the application, loads profiles, and sets up app events.
     */
    init() {
        const gotTheLock = app.requestSingleInstanceLock();

        if (!gotTheLock) {
            app.quit();
        } else {
            app.on('second-instance', () => {
                if (this.configWin) {
                    if (this.configWin.isMinimized()) this.configWin.restore();
                    this.configWin.focus();
                } else {
                    this.createConfigWindow();
                }
            });

            this.profiles = this.configManager.getProfiles();
            app.disableHardwareAcceleration();
            app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

            app.whenReady().then(() => this.onReady());
            app.on('will-quit', () => this.onWillQuit());
            app.on('window-all-closed', () => this.onWindowAllClosed());
        }
    }

    /**
     * Called when the app is ready. Creates the tray icon, profile windows, and registers handlers.
     */
    async onReady() {
        // Ensure all settings are loaded before creating windows
        await this.ensureSettingsLoaded();
        
        this.createTray();
        
        // Create profile windows with proper validation
        this.profiles.forEach(profile => {
            this.createProfileWindow(profile);
            this.registerProfileShortcut(profile);
        });
        
        this.registerF5Hotkey();
        registerIpcHandlers(this.configManager, this);
    }

    /**
     * Ensures all settings are properly loaded before window creation.
     */
    async ensureSettingsLoaded() {
        // Small delay to ensure all async operations are complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Re-validate all profiles against current displays
        this.profiles = this.profiles.map(profile => {
            const validatedDisplay = this.validateMonitorPosition(profile.monitorId);
            if (validatedDisplay.id !== profile.monitorId) {
                console.log(`Updated profile '${profile.displayName}' monitor from ${profile.monitorId} to ${validatedDisplay.id}`);
                // Update profile with validated monitor ID
                const updatedProfile = { ...profile, monitorId: validatedDisplay.id };
                this.configManager.updateProfile(profile.id, updatedProfile);
                return updatedProfile;
            }
            return profile;
        });
    }

    /**
     * Registers the F5 hotkey to reload the current page.
     */
    registerF5Hotkey() {
    }

    /**
     * Reloads a profile's window to its kioskURL.
     * @param {string} profileId The ID of the profile to reload.
     */
    reloadProfileWindow(profileId) {
        const window = this.profileWindows.get(profileId);
        const profile = this.profiles.find(p => p.id === profileId);
        if (window && profile) {
            window.loadURL(profile.kioskURL);
        }
    }

    /**
     * Called before the app quits. Unregisters all shortcuts.
     */
    onWillQuit() {
        this.isQuitting = true;
        globalShortcut.unregisterAll();
    }

    /**
     * Called when all windows are closed. Quits the app if not on macOS.
     */
    onWindowAllClosed() {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    }

    /**
     * Returns a list of available displays.
     * @returns {Array<Object>} A list of displays with their properties.
     */
    getAvailableDisplays() {
        const displays = screen.getAllDisplays();
        return displays.map(display => ({
            id: display.id,
            bounds: display.bounds,
            label: `${display.label || 'Display'} (${display.size.width}x${display.size.height})`
        }));
    }

    /**
     * Validates if a monitor position is still valid and within current displays.
     * @param {number} monitorId The monitor ID to validate.
     * @param {object} savedBounds Optional saved bounds to validate.
     * @returns {object} Validated display object or primary display fallback.
     */
    validateMonitorPosition(monitorId, savedBounds = null) {
        const displays = screen.getAllDisplays();
        const primaryDisplay = screen.getPrimaryDisplay();
        
        // First, try to find the exact monitor by ID
        let targetDisplay = displays.find(d => d.id === monitorId);
        
        if (targetDisplay) {
            // Monitor exists, but validate bounds if provided
            if (savedBounds) {
                const displayBounds = targetDisplay.bounds;
                // Check if saved bounds are within the current display bounds
                const isWithinBounds = savedBounds.x >= displayBounds.x && 
                                     savedBounds.y >= displayBounds.y &&
                                     savedBounds.x < displayBounds.x + displayBounds.width &&
                                     savedBounds.y < displayBounds.y + displayBounds.height;
                
                if (!isWithinBounds) {
                    console.warn(`Saved bounds for monitor ${monitorId} are outside current display area. Using display bounds.`);
                }
            }
            return targetDisplay;
        }
        
        // Monitor not found, log warning and fallback to primary
        console.warn(`Monitor ${monitorId} not found. Falling back to primary display.`);
        return primaryDisplay;
    }

    /**
     * Creates a BrowserWindow for a given profile.
     * @param {object} profile The profile to create a window for.
     */
    createProfileWindow(profile) {
        // Validate monitor position and get proper display
        const display = this.validateMonitorPosition(profile.monitorId);
        
        // Log monitor selection for debugging
        console.log(`Creating window for profile '${profile.displayName}' on monitor ${display.id} (${display.bounds.width}x${display.bounds.height})`);

        const newWindow = new BrowserWindow({
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height,
            show: false,
            autoHideMenuBar: true,
            fullscreen: true,
            icon: path.join(__dirname, '..\build\icon.ico'),
            skipTaskbar: profile.hideFromTaskbar,
            webPreferences: { 
                backgroundThrottling: profile.enableBackgroundThrottling,
                contextIsolation: true,
                nodeIntegration: false,
                webSecurity: true
            }
        });

        if (profile.muteAudioWhenBlurred) {
            newWindow.webContents.setAudioMuted(true);
        }

        newWindow.loadURL(profile.kioskURL);

        newWindow.on('close', (e) => {
            if (!this.isQuitting) {
                e.preventDefault();
                newWindow.hide();
            }
        });

        newWindow.on('blur', () => {
            const currentProfile = this.profiles.find(p => p.id === profile.id);
            if (currentProfile && currentProfile.muteAudioWhenBlurred) {
                newWindow.webContents.setAudioMuted(true);
            }
        });
        newWindow.on('focus', () => {
            // Always unmute on focus. If the setting was turned off while blurred, 
            // the window would otherwise remain muted.
            newWindow.webContents.setAudioMuted(false);
        });

        newWindow.webContents.on('before-input-event', (event, input) => {
            if (input.key === 'F5' && input.type === 'keyDown') {
                event.preventDefault();
                this.reloadProfileWindow(profile.id);
            }
        });

        this.profileWindows.set(profile.id, newWindow);
    }

    /**
     * Registers a global shortcut for a profile.
     * @param {object} profile The profile to register the shortcut for.
     */
    registerProfileShortcut(profile) {
        if (profile.hotkey) {
            try {
                globalShortcut.register(profile.hotkey, () => this.toggleProfileWindow(profile.id));
            } catch (e) {
                dialog.showErrorBox('Hotkey Error', `Failed to register hotkey "${profile.hotkey}" for ${profile.displayName}.`);
            }
        }
    }

    /**
     * Toggles the visibility of a profile's window.
     * @param {string} profileId The ID of the profile to toggle.
     */
    toggleProfileWindow(profileId) {
        const window = this.profileWindows.get(profileId);
        if (!window) return;

        if (window.isVisible()) {
            window.hide();
        } else {
            const profile = this.profiles.find(p => p.id === profileId);
            this.profileWindows.forEach((win, id) => {
                if (id !== profileId && win.isVisible()) {
                    win.hide();
                }
            });
            if (profile && profile.enableRefreshOnOpen) {
                this.reloadProfileWindow(profile.id);
            }
            window.show();
            window.focus();
        }
    }

    /**
     * Creates the application tray icon and context menu.
     */
    createTray() {
        const trayIconPath = path.join(__dirname, 'assets/icon.png');
        this.tray = new Tray(trayIconPath);
        this.tray.setToolTip('HotkeyMyURL Manager (Running...)');
        this.tray.on('double-click', () => this.createConfigWindow());

        const contextMenu = Menu.buildFromTemplate([
            { label: 'Settings', click: () => this.createConfigWindow() },
            {
                label: 'Start with Windows',
                type: 'checkbox',
                checked: this.configManager.getStartWithWindows(),
                click: (menuItem) => this.toggleStartWithWindows(menuItem.checked)
            },
            { type: 'separator' },
            { label: 'Exit', click: () => { this.isQuitting = true; app.quit(); } }
        ]);
        this.tray.setContextMenu(contextMenu);
    }

    /**
     * Toggles the 'Start with Windows' setting.
     * @param {boolean} startWithWindows Whether the app should start with Windows.
     */
    toggleStartWithWindows(startWithWindows) {
        this.configManager.setStartWithWindows(startWithWindows);
        app.setLoginItemSettings({
            openAtLogin: startWithWindows,
            args: ['--hidden'] // The main process will handle showing/hiding windows.
        });
    }

    /**
     * Creates the configuration window.
     */
    createConfigWindow() {
        if (this.configWin) return this.configWin.focus();
        this.configWin = new BrowserWindow({
            width: 1200, height: 800, title: 'HotkeyMyURL Manager',
            autoHideMenuBar: true,
            icon: path.join(__dirname, '..\build\icon.ico'),
            webPreferences: { 
                preload: path.join(__dirname, 'preload-config.js'),
                contextIsolation: true,
                nodeIntegration: false
            }
        });
        this.configWin.loadFile(path.join(__dirname, 'config.html'));
        this.configWin.on('closed', () => { this.configWin = null; });
    }

    /**
     * Creates the hotkey selection window.
     */
    createHotkeyWindow(currentHotkey) {
        if (this.hotkeyWin) return this.hotkeyWin.focus();

        const configWinBounds = this.configWin.getBounds();
        const hotkeyWinWidth = 1440; // As defined in the current code
        const hotkeyWinHeight = 720; // As defined in the current code

        const x = Math.round(configWinBounds.x + (configWinBounds.width / 2) - (hotkeyWinWidth / 2));
        const y = Math.round(configWinBounds.y + (configWinBounds.height / 2) - (hotkeyWinHeight / 2));

        this.hotkeyWin = new BrowserWindow({
            x: x,
            y: y,
            width: hotkeyWinWidth, 
            height: hotkeyWinHeight, 
            title: 'Select Hotkey', 
            parent: this.configWin, 
            modal: true,
            autoHideMenuBar: true,
            webPreferences: { 
                preload: path.join(__dirname, 'preload-hotkey.js'),
                contextIsolation: true,
                nodeIntegration: false
            }
        });
        const url = new URL(path.join(__dirname, 'hotkey.html'), 'file:');
        if (currentHotkey) {
            url.searchParams.append('hotkey', currentHotkey);
        }
        this.hotkeyWin.loadURL(url.href);
        this.hotkeyWin.on('closed', () => { this.hotkeyWin = null; });
    }

    /**
     * Updates the application after a profile has been changed.
     * @param {string} profileId The ID of the profile that was updated.
     */
    updateAppWithNewConfig(profileId) {
        const oldProfile = this.profiles.find(p => p.id === profileId);
        this.profiles = this.configManager.getProfiles();
        const newProfile = this.profiles.find(p => p.id === profileId);

        if (oldProfile && newProfile) {
            this.updateProfileWindow(profileId, oldProfile, newProfile);
            this.updateProfileShortcut(oldProfile, newProfile);
        }
    }

    /**
     * Updates a profile's window with new settings.
     * @param {string} profileId The ID of the profile to update.
     * @param {object} oldProfile The old profile data.
     * @param {object} newProfile The new profile data.
     */
    updateProfileWindow(profileId, oldProfile, newProfile) {
        const window = this.profileWindows.get(profileId);
        if (!window) return;

        // Validate new monitor position before comparison
        const validatedDisplay = this.validateMonitorPosition(newProfile.monitorId);
        const validatedNewProfile = { ...newProfile, monitorId: validatedDisplay.id };

        // Check if a full window recreation is needed
        const needsRecreation = validatedNewProfile.kioskURL !== oldProfile.kioskURL ||
                                validatedNewProfile.monitorId !== oldProfile.monitorId ||
                                validatedNewProfile.enableBackgroundThrottling !== oldProfile.enableBackgroundThrottling ||
                                validatedNewProfile.enableRefreshOnOpen !== oldProfile.enableRefreshOnOpen ||
                                validatedNewProfile.muteAudioWhenBlurred !== oldProfile.muteAudioWhenBlurred ||
                                validatedNewProfile.hideFromTaskbar !== oldProfile.hideFromTaskbar;

        if (needsRecreation) {
            const wasVisible = window.isVisible(); // Check visibility before destroying
            console.log(`Recreating window for profile '${validatedNewProfile.displayName}' due to settings change`);
            
            this.destroyProfileWindow(profileId);
            this.createProfileWindow(validatedNewProfile); // Creates the window but doesn't show it

            if (wasVisible) {
                const newWindow = this.profileWindows.get(profileId);
                if (newWindow) {
                    console.log(`Restoring visibility for profile '${validatedNewProfile.displayName}'`);
                    newWindow.show(); // Show it only if the old one was visible
                    newWindow.focus();
                }
            }
        }
    }

    /**
     * Updates a profile's global shortcut.
     * @param {object} oldProfile The old profile data.
     * @param {object} newProfile The new profile data.
     */
    updateProfileShortcut(oldProfile, newProfile) {
        if (newProfile.hotkey !== oldProfile.hotkey) {
            if (oldProfile.hotkey) {
                globalShortcut.unregister(oldProfile.hotkey);
            }
            this.registerProfileShortcut(newProfile);
        }
    }

    /**
     * Unregisters a profile's global shortcut.
     * @param {object} profile The profile to unregister the shortcut for.
     */
    unregisterProfileShortcut(profile) {
        if (profile.hotkey) {
            globalShortcut.unregister(profile.hotkey);
        }
    }

    /**
     * Destroys a profile's BrowserWindow.
     * @param {string} profileId The ID of the profile whose window should be destroyed.
     */
    destroyProfileWindow(profileId) {
        const window = this.profileWindows.get(profileId);
        if (window) {
            window.destroy();
            this.profileWindows.delete(profileId);
        }
    }

    // Methods called from ipcHandlers
    getProfiles = () => this.profiles;
    getPrimaryMonitorId = () => screen.getPrimaryDisplay().id;
    sendHotkeyToConfigWindow = (hotkey) => this.configWin?.webContents.send('hotkey-updated', hotkey);
    closeHotkeyWindow = () => this.hotkeyWin?.close();
    closeConfigWindow = () => this.configWin?.close();

    updateAllWindowThemes(theme) {
        const currentTheme = theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : theme;
        if (this.configWin) {
            this.configWin.webContents.send('update-theme', currentTheme);
        }
        if (this.hotkeyWin) {
            this.hotkeyWin.webContents.send('update-theme', currentTheme);
        }
    }
}

const mainApp = new MainApp();
mainApp.init();

// Listen for system theme changes
nativeTheme.on('updated', () => {
    const savedTheme = mainApp.configManager.getTheme();
    if (savedTheme === 'system') {
        mainApp.updateAllWindowThemes('system');
    }
});
