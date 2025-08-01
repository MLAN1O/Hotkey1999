// main.js
const { app, BrowserWindow, globalShortcut, Menu, Tray, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ConfigManager = require('./ConfigManager');
const { registerIpcHandlers } = require('./ipcHandlers');

class MainApp {
    constructor() {
        this.configManager = new ConfigManager();
        this.currentInstanceId = null;
        this.win = null;
        this.configWin = null;
        this.hotkeyWin = null;
        this.tray = null;
        this.lastWindowState = {};
        this.isQuitting = false;
        this.config = null;
    }

    init() {
        this.currentInstanceId = this.getInstanceIdFromArgs();
        this.config = this.configManager.loadConfig(this.currentInstanceId);

        app.disableHardwareAcceleration();
        app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

        app.whenReady().then(() => this.onReady());
        app.on('will-quit', () => this.onWillQuit());
        app.on('window-all-closed', () => this.onWindowAllClosed());
    }

    getInstanceIdFromArgs() {
        const args = process.argv;
        const instanceArg = args.find(arg => arg.startsWith('--instanceId='));
        return instanceArg ? instanceArg.split('=')[1] : 'default';
    }

    onReady() {
        this.createTray();
        this.createWindow();
        this.registerGlobalShortcuts();
        app.on('activate', () => !this.win && this.createWindow());
        registerIpcHandlers(this.configManager, this);
    }

    onWillQuit() {
        this.isQuitting = true;
        globalShortcut.unregisterAll();
    }

    onWindowAllClosed() {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    }

    toggleMainWindow() {
        if (!this.win) return;
        this.win.isVisible() ? this.win.hide() : this.restoreWindow();
    }

    createTray() {
        const trayIconPath = fs.existsSync(this.config.iconPath) ? this.config.iconPath : path.join(__dirname, 'assets/icon.png');
        this.tray = new Tray(trayIconPath);
        this.tray.setToolTip(`${this.config.displayName} (Running...)`);

        const contextMenu = Menu.buildFromTemplate([
            { label: 'Open', click: () => this.restoreWindow() },
            { label: 'Settings', click: () => this.createConfigWindow() },
            {
                label: 'Start with Windows',
                type: 'checkbox',
                checked: this.config.startWithWindows,
                click: (menuItem) => this.toggleStartWithWindows(menuItem.checked)
            },
            { type: 'separator' },
            { label: 'Exit', click: () => { this.isQuitting = true; app.quit(); } }
        ]);
        this.tray.setContextMenu(contextMenu);
        this.tray.on('click', () => this.restoreWindow());
    }

    toggleStartWithWindows(startWithWindows) {
        app.setLoginItemSettings({
            openAtLogin: startWithWindows,
            args: ['--hidden', `--instanceId=${this.currentInstanceId}`]
        });
        this.configManager.saveConfig({ startWithWindows }, this.currentInstanceId);
        this.config.startWithWindows = startWithWindows;
    }

    createConfigWindow() {
        if (this.configWin) return this.configWin.focus();
        this.configWin = new BrowserWindow({
            width: 1024, height: 768, title: `Settings for Instance: ${this.config.displayName}`,
            autoHideMenuBar: true,
            webPreferences: { preload: path.join(__dirname, 'preload-config.js') }
        });
        this.configWin.loadFile(path.join(__dirname, 'config.html'));
        this.configWin.on('closed', () => { this.configWin = null; });
    }

    createHotkeyWindow() {
        if (this.hotkeyWin) return this.hotkeyWin.focus();
        this.hotkeyWin = new BrowserWindow({
            width: 1024, height: 768, title: 'Select Hotkey', parent: this.configWin, modal: true,
            autoHideMenuBar: true,
            webPreferences: { preload: path.join(__dirname, 'preload-hotkey.js') }
        });
        this.hotkeyWin.loadFile(path.join(__dirname, 'hotkey.html'));
        this.hotkeyWin.on('closed', () => { this.hotkeyWin = null; });
    }

    restoreWindow() {
        if (!this.win) return;
        if (this.win.isVisible()) return this.win.focus();

        if (this.lastWindowState.isFullScreen) this.win.setFullScreen(true);
        else if (this.lastWindowState.bounds) {
            this.win.setFullScreen(false);
            this.win.setBounds(this.lastWindowState.bounds);
        } else this.win.setFullScreen(true);
        this.win.show();
        this.win.focus();
    }

    saveWindowState() {
        if (!this.win) return;
        this.lastWindowState = {
            isFullScreen: this.win.isFullScreen(),
            bounds: this.win.isMinimized() ? this.lastWindowState.bounds : this.win.getBounds()
        };
    }

    createWindow() {
        this.win = new BrowserWindow({
            show: false, width: 1024, height: 768, autoHideMenuBar: true,
            icon: path.join(__dirname, '../build/icon.ico'),
            webPreferences: { backgroundThrottling: false }
        });
        this.win.loadURL(this.config.kioskURL);
        this.win.setFullScreen(true);

        if (!process.argv.includes('--hidden')) this.win.show();
        else this.saveWindowState();

        this.win.on('close', (e) => { if (!this.isQuitting) { e.preventDefault(); this.saveWindowState(); this.win.hide(); } });
        this.win.on('resize', () => this.saveWindowState());
        this.win.on('move', () => this.saveWindowState());
        this.win.on('enter-full-screen', () => this.saveWindowState());
        this.win.on('leave-full-screen', () => this.saveWindowState());
        this.win.on('blur', () => this.win.webContents.setAudioMuted(true));
        this.win.on('focus', () => this.win.webContents.setAudioMuted(false));
        this.win.webContents.on('page-title-updated', (e, title) => {
            if (this.tray) this.tray.setToolTip(`${this.config.displayName || title} (Running)`);
        });
    }

    registerGlobalShortcuts() {
        if (this.config.hotkey) {
            try {
                globalShortcut.register(this.config.hotkey, () => this.toggleMainWindow());
            } catch (e) {
                dialog.showErrorBox('Hotkey Error', `Failed to register hotkey "${this.config.hotkey}".`);
            }
        }
        globalShortcut.register('F5', () => this.win.webContents.reload());
    }

    updateAppWithNewConfig(oldConfig, newConfig) {
        this.config = newConfig;
        this.updateTray(newConfig);
        this.updateMainWindow(oldConfig, newConfig);
        this.updateGlobalShortcut(oldConfig, newConfig);
    }

    updateTray(newSettings) {
        if (newSettings.iconPath && fs.existsSync(newSettings.iconPath)) {
            this.tray.setImage(newSettings.iconPath);
        }
        if (newSettings.displayName) {
            this.tray.setToolTip(`${newSettings.displayName} (Running)`);
        }
    }

    updateMainWindow(oldConfig, newSettings) {
        if (newSettings.kioskURL !== oldConfig.kioskURL) {
            this.win.loadURL(newSettings.kioskURL);
        }
    }

    updateGlobalShortcut(oldConfig, newSettings) {
        if (newSettings.hotkey !== oldConfig.hotkey) {
            if (oldConfig.hotkey) globalShortcut.unregister(oldConfig.hotkey);
            if (newSettings.hotkey) {
                try {
                    globalShortcut.register(newSettings.hotkey, () => this.toggleMainWindow());
                } catch (e) {
                    dialog.showErrorBox('Hotkey Error', `Failed to register hotkey "${newSettings.hotkey}".`);
                }
            }
        }
    }

    // Methods called from ipcHandlers
    getCurrentInstanceId = () => this.currentInstanceId;
    getConfig = () => this.config;
    sendHotkeyToConfigWindow = (hotkey) => this.configWin?.webContents.send('hotkey-updated', hotkey);
    closeHotkeyWindow = () => this.hotkeyWin?.close();
    closeConfigWindow = () => this.configWin?.close();
}

const mainApp = new MainApp();
mainApp.init();
