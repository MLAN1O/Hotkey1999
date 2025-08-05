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
        this.profileWindows = new Map(); // <profileId, BrowserWindow>
        this.monitorWindows = new Map(); // <monitorId, BrowserWindow> - monitor exclusivity control
        this.windowMonitorMapping = new Map(); // <BrowserWindow, monitorId> - reverse mapping
        this.configWin = null;
        this.hotkeyWin = null;
        this.tray = null;
        this.isQuitting = false;
        this.debugMode = true; // Force debug mode for this session
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
        const profiles = this.configManager.getProfiles();
        profiles.forEach(profile => {
            this.createProfileWindow(profile);
            this.registerProfileShortcut(profile);
        });
        
        this.registerF5Hotkey();
        registerIpcHandlers(this.configManager, this);

        // Global audio management based on window focus state
        // Global audio management based on window focus state
        app.on('browser-window-focus', (event, window) => {
            // Rule #2: Always unmute the focused window (if it's a profile window)
            if (window && !window.isDestroyed() && window.profileId) {
                window.webContents.setAudioMuted(false);
            }
        });

                app.on('browser-window-blur', (event, window) => {
            // Rule #3: For blurred windows, mute state depends on the profile setting
            if (window && !window.isDestroyed() && window.profileId) {
                // Directly get the latest profile data from the source of truth
                const latestProfile = this.configManager.getProfileById(window.profileId);
                
                if (latestProfile) {
                    window.webContents.setAudioMuted(latestProfile.muteAudioWhenBlurred);
                } else {
                    // Should not happen, but good to have a fallback
                }
            }
        });
    }

    /**
     * Ensures all settings are properly loaded before window creation.
     */
    async ensureSettingsLoaded() {
        // Small delay to ensure all async operations are complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Re-validate all profiles against current displays
        let profiles = this.configManager.getProfiles();
        profiles = profiles.filter(profile => {
            // Remove profiles with invalid data
            if (!profile || !profile.id || !profile.displayName) {
                this.errorLog(`Invalid profile removed:`, profile);
                return false;
            }
            return true;
        }).map(profile => {
            const validatedDisplay = this.validateMonitorPosition(profile.monitorId);
            if (validatedDisplay.id !== profile.monitorId) {
                this.debugLog(`Updating monitor for profile '${profile.displayName}' from ${profile.monitorId} to ${validatedDisplay.id}`);
                // Update profile with validated monitor ID
                const updatedProfile = { ...profile, monitorId: validatedDisplay.id };
                this.configManager.updateProfile(profile.id, updatedProfile);
                return updatedProfile;
            }
            return profile;
        });
        
        // Save the updated profiles back to ConfigManager if any changes were made
        this.configManager.saveProfiles(profiles);
        
        this.debugLog(`Validation completed: ${profiles.length} valid profiles loaded`);
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
        const profile = this.configManager.getProfileById(profileId);
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
                
                if (!isWithinBounds && this.debugMode) {
                    console.warn(`Saved bounds for monitor ${monitorId} are outside current display area. Using display bounds.`);
                }
            }
            return targetDisplay;
        }
        
        // Monitor not found, log warning and fallback to primary
        if (this.debugMode) {
            console.warn(`Monitor ${monitorId} not found. Falling back to primary display.`);
        }
        return primaryDisplay;
    }

    /**
     * Log debug messages only when in debug mode.
     * @param {string} message Debug message to log.
     * @param {...any} args Additional arguments.
     */
    debugLog(message, ...args) {
        if (this.debugMode) {
            console.log(`[DEBUG] ${message}`, ...args);
        }
    }

    /**
     * Log error messages (always shown).
     * @param {string} message Error message to log.
     * @param {...any} args Additional arguments.
     */
    errorLog(message, ...args) {
        console.error(`[ERROR] ${message}`, ...args);
    }

    /**
     * Manages window exclusivity per monitor.
     * If a window already exists on the monitor, it is closed before opening the new one.
     * @param {number} monitorId Monitor ID where the window will be opened.
     * @param {BrowserWindow} newWindow New window to be associated with the monitor.
     * @param {string} profileId Profile ID of the new window.
     */
    manageMonitorExclusivity(monitorId, newWindow, profileId) {
        // Validate if the profile still exists before proceeding
        const profile = this.configManager.getProfileById(profileId);
        if (!profile) {
            console.error(`ERROR: Profile ${profileId} not found. Cancelling window creation.`);
            if (newWindow && !newWindow.isDestroyed()) {
                newWindow.destroy();
            }
            return false;
        }

        // Check if a window already exists on this monitor
        const existingWindow = this.monitorWindows.get(monitorId);
        
        if (existingWindow && !existingWindow.isDestroyed()) {
            // Remove existing window mappings SILENTLY
            this.windowMonitorMapping.delete(existingWindow);
            
            // Find and remove the profileId of the existing window
            for (const [pId, window] of this.profileWindows) {
                if (window === existingWindow) {
                    this.profileWindows.delete(pId);
                    break;
                }
            }
            
            // Close the existing window
            existingWindow.destroy();
        }
        
        // Associate the new window with the monitor
        this.monitorWindows.set(monitorId, newWindow);
        this.windowMonitorMapping.set(newWindow, monitorId);
        this.profileWindows.set(profileId, newWindow);
        
        // Configure event to clean up mappings when window is closed
        newWindow.on('closed', () => {
            this.cleanupWindowMappings(newWindow, monitorId, profileId);
        });
        
        return true;
    }

    /**
     * Cleans up mappings when a window is closed.
     * @param {BrowserWindow} window Window that was closed.
     * @param {number} monitorId Monitor ID.
     * @param {string} profileId Profile ID.
     */
    cleanupWindowMappings(window, monitorId, profileId) {
        this.monitorWindows.delete(monitorId);
        this.windowMonitorMapping.delete(window);
        this.profileWindows.delete(profileId);
        // Log removed to reduce pollution
    }

    /**
     * Creates a BrowserWindow for a given profile.
     * @param {object} profile The profile to create a window for.
     */
    createProfileWindow(profile) {
        // Strict profile validation
        if (!profile || !profile.id) {
            console.error('ERROR: Invalid profile provided to createProfileWindow');
            return null;
        }

        // Check if the profile still exists in the current list
        const currentProfile = this.configManager.getProfileById(profile.id);
        if (!currentProfile) {
            console.error(`ERROR: Profile ${profile.id} no longer exists in the profile list`);
            return null;
        }

        // Validate monitor position and get proper display
        const display = this.validateMonitorPosition(profile.monitorId);
        
        try {
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

            // Manage monitor exclusivity
            const success = this.manageMonitorExclusivity(display.id, newWindow, profile.id);
            if (!success) {
                return null;
            }

            // Attach profileId directly to the window for easier access in global handlers
            newWindow.profileId = profile.id; 

            newWindow.loadURL(profile.kioskURL);

            // Rule #1: Always mute the window when it is hidden
            newWindow.on('hide', () => {
                newWindow.webContents.setAudioMuted(true);
            });

            newWindow.on('close', (e) => {
                if (!this.isQuitting) {
                    e.preventDefault();
                    newWindow.hide();
                }
            });

            newWindow.webContents.on('before-input-event', (event, input) => {
                if (input.key === 'F5' && input.type === 'keyDown') {
                    event.preventDefault();
                    this.reloadProfileWindow(profile.id);
                }
                // Handle Ctrl+R
                if (input.key === 'r' && input.control && input.type === 'keyDown') {
                    event.preventDefault();
                    newWindow.webContents.reload();
                }
            });

            return newWindow;
            
        } catch (error) {
            console.error(`ERROR creating window for profile ${profile.id}:`, error);
            return null;
        }
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
     * Toggles the visibility of a profile's window with multi-monitor support.
     * @param {string} profileId The ID of the profile to toggle.
     */
    toggleProfileWindow(profileId) {
        // Get fresh profile data from ConfigManager to ensure latest settings
        const profile = this.configManager.getProfileById(profileId);
        if (!profile) {
            console.error(`ERROR: Profile ${profileId} not found. Recreating window...`);
            this.recoverMissingProfile(profileId);
            return;
        }

        let window = this.profileWindows.get(profileId);
        
        // If window doesn't exist or was destroyed, recreate it
        if (!window || window.isDestroyed()) {
            console.warn(`Window for profile '${profile.displayName}' not found. Recreating...`);
            window = this.createProfileWindow(profile);
            if (!window) {
                console.error(`ERROR: Could not recreate window for profile '${profile.displayName}'`);
                return;
            }
        }

        if (window.isVisible()) {
            window.hide();
        } else {
            // Get the monitor associated with this window
            const monitorId = this.windowMonitorMapping.get(window);
            
            // Hide other windows only on the same monitor
            for (const [otherId, otherWindow] of this.profileWindows) {
                if (otherId !== profileId && 
                    otherWindow && !otherWindow.isDestroyed() &&
                    otherWindow.isVisible() && 
                    this.windowMonitorMapping.get(otherWindow) === monitorId) {
                    otherWindow.hide();
                }
            }
            
            window.show();
            window.focus();
            
            // Refresh if configured (using Ctrl+R equivalent after window is shown)
            if (profile.enableRefreshOnOpen === true) {
                // Wait for window to be fully shown and loaded before reloading
                setTimeout(() => {
                    if (window && !window.isDestroyed()) {
                        window.webContents.reload();
                    }
                }, 200);
            }
        }
    }

    /**
     * Attempts to recover a lost profile by recreating its window.
     * @param {string} profileId ID of the lost profile.
     */
    recoverMissingProfile(profileId) {
        // Get fresh profile data from ConfigManager
        const profile = this.configManager.getProfileById(profileId);
        if (profile) {
            this.debugLog(`Recovering profile ${profileId}: ${profile.displayName}`);
            const window = this.createProfileWindow(profile);
            if (window) {
                // Register hotkey again if necessary
                this.registerProfileShortcut(profile);
                this.debugLog(`Profile ${profileId} recovered successfully`);
            }
        } else {
            this.errorLog(`Profile ${profileId} was not found even in saved data`);
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
     * Updates a profile's window with new settings.
     * @param {string} profileId The ID of the profile to update.
     * @param {object} oldProfile The old profile data.
     * @param {object} newProfile The new profile data.
     */
    updateProfileWindow(profileId, oldProfile, newProfile) {
        // Robust input data validation
        if (!profileId || !oldProfile || !newProfile) {
            this.errorLog('updateProfileWindow: Invalid data provided');
            return;
        }

        const window = this.profileWindows.get(profileId);
        if (!window || window.isDestroyed()) {
            this.debugLog(`updateProfileWindow: Window for profile ${profileId} not found or destroyed`);
            return;
        }

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
            this.debugLog(`Recreating window for profile '${validatedNewProfile.displayName}' due to settings change`);
            
            this.destroyProfileWindow(profileId);
            const newWindow = this.createProfileWindow(validatedNewProfile);

            if (wasVisible && newWindow) {
                this.debugLog(`Restoring visibility for profile '${validatedNewProfile.displayName}'`);
                newWindow.show();
                newWindow.focus();
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
     * Destroys a profile's BrowserWindow and cleans up all mappings.
     * @param {string} profileId The ID of the profile whose window should be destroyed.
     */
    destroyProfileWindow(profileId) {
        const window = this.profileWindows.get(profileId);
        if (window && !window.isDestroyed()) {
            const monitorId = this.windowMonitorMapping.get(window);
            
            // Remove todos os mapeamentos
            this.profileWindows.delete(profileId);
            this.windowMonitorMapping.delete(window);
            if (monitorId) {
                this.monitorWindows.delete(monitorId);
            }
            
            window.destroy();
        }
    }

    // Methods called from ipcHandlers
    getProfiles = () => this.configManager.getProfiles();
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
