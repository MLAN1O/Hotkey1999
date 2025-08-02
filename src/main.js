'''// main.js
const { app, BrowserWindow, globalShortcut, Menu, Tray, dialog } = require('electron');
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
    onReady() {
        this.createTray();
        this.profiles.forEach(profile => {
            this.createProfileWindow(profile);
            this.registerProfileShortcut(profile);
        });
        this.registerF5Hotkey();
        registerIpcHandlers(this.configManager, this);
    }

    /**
     * Registers the F5 hotkey to reload the current page.
     */
    registerF5Hotkey() {
        try {
            globalShortcut.register('F5', () => {
                const visibleWindow = [...this.profileWindows.values()].find(win => win.isVisible());
                if (visibleWindow) {
                    const profileId = [...this.profileWindows.entries()].find(([id, win]) => win === visibleWindow)[0];
                    this.reloadProfileWindow(profileId);
                }
            });
        } catch (e) {
            dialog.showErrorBox('Hotkey Error', 'Failed to register F5 hotkey.');
        }
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
     * Creates a BrowserWindow for a given profile.
     * @param {object} profile The profile to create a window for.
     */
    createProfileWindow(profile) {
        const newWindow = new BrowserWindow({
            show: false,
            width: 1024, height: 768,
            autoHideMenuBar: true,
            icon: path.join(__dirname, '..\build\icon.ico'),
            webPreferences: { backgroundThrottling: false }
        });

        newWindow.loadURL(profile.kioskURL);
        newWindow.setFullScreen(true);

        newWindow.on('close', (e) => {
            if (!this.isQuitting) {
                e.preventDefault();
                newWindow.hide();
            }
        });

        newWindow.on('blur', () => newWindow.webContents.setAudioMuted(true));
        newWindow.on('focus', () => newWindow.webContents.setAudioMuted(false));

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
            this.profileWindows.forEach((win, id) => {
                if (id !== profileId && win.isVisible()) {
                    win.hide();
                }
            });
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
            width: 1024, height: 768, title: 'HotkeyMyURL Manager',
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

        if (newProfile.kioskURL !== oldProfile.kioskURL) {
            window.loadURL(newProfile.kioskURL);
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
    sendHotkeyToConfigWindow = (hotkey) => this.configWin?.webContents.send('hotkey-updated', hotkey);
    closeHotkeyWindow = () => this.hotkeyWin?.close();
    closeConfigWindow = () => this.configWin?.close();
}

const mainApp = new MainApp();
mainApp.init();
'''