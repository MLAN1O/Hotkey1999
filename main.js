// main.js

const { app, BrowserWindow, globalShortcut, Menu, Tray, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const configPath = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (error) { console.error("Error loading config.json:", error); }
  return { 
    kioskURL: 'https://en.wikipedia.org/wiki/Space_Invaders_(Atari_2600_video_game)',
    hotkey: 'Home',
    displayName: 'HotkeyMyURLLikeIts1999',
    // The default tray icon is icon.png
    iconPath: path.join(__dirname, 'icon.png'),
    // Default value for the new setting
    startWithWindows: false
  };
}

function saveConfig(newConfig) {
    try {
        const updatedConfig = { ...loadConfig(), ...newConfig };
        fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
        return updatedConfig;
    } catch (error) { console.error('Failed to save config:', error); return null; }
}

let config = loadConfig();
let win, configWin, hotkeyWin, tray;
let lastWindowState = {};
let isQuitting = false;

function toggleMainWindow() {
    if (!win) return;
    win.isVisible() ? win.hide() : restoreWindow();
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createTray() {
  // The tray icon can be customized by the user. Default is icon.png.
  const trayIconPath = fs.existsSync(config.iconPath) ? config.iconPath : path.join(__dirname, 'icon.png');
  tray = new Tray(trayIconPath);
  tray.setToolTip(`${config.displayName} (Running...)`);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open', click: restoreWindow },
    { label: 'Settings', click: createConfigWindow },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      // Read the state from our config file, which is the source of truth
      checked: config.startWithWindows,
      click: (menuItem) => {
        const startWithWindows = menuItem.checked;
        // Update the OS setting
        app.setLoginItemSettings({
          openAtLogin: startWithWindows,
          // Ensure it starts hidden when launched at startup
          args: ['--hidden']
        });
        // Save the new state to our config file
        saveConfig({ startWithWindows: startWithWindows });
        // Also update the in-memory config object for consistency
        config.startWithWindows = startWithWindows;
      }
    },
    { type: 'separator' },
    { label: 'Exit', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', restoreWindow);
}

function createConfigWindow() {
    if (configWin) return configWin.focus();
    configWin = new BrowserWindow({
        width: 1024, height: 768, title: 'Settings', autoHideMenuBar: true,
        webPreferences: { preload: path.join(__dirname, 'preload-config.js') }
    });
    configWin.loadFile('config.html');
    configWin.on('closed', () => { configWin = null; });
}

function createHotkeyWindow() {
    if (hotkeyWin) return hotkeyWin.focus();
    hotkeyWin = new BrowserWindow({
        width: 1024, height: 768, title: 'Select Hotkey', parent: configWin, modal: true,
        autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload-hotkey.js') }
    });
    hotkeyWin.loadFile('hotkey.html');
    hotkeyWin.on('closed', () => { hotkeyWin = null; });
}

function restoreWindow() {
  if (!win) return;
  if (win.isVisible()) return win.focus();
  if (lastWindowState.isFullScreen) win.setFullScreen(true);
  else if (lastWindowState.bounds) {
    win.setFullScreen(false);
    win.setBounds(lastWindowState.bounds);
  } else win.setFullScreen(true);
  win.show();
  win.focus();
}

function saveWindowState() {
  if (!win) return;
  lastWindowState.isFullScreen = win.isFullScreen();
  if (!win.isMinimized()) lastWindowState.bounds = win.getBounds();
}

function createWindow() {
  // The main window and taskbar icon will always be icon.ico
  const appIconPath = path.join(__dirname, 'icon.ico');
  win = new BrowserWindow({
    show: false, width: 1024, height: 768, autoHideMenuBar: true, icon: appIconPath,
    webPreferences: { backgroundThrottling: false }
  });
  win.loadURL(config.kioskURL);
  win.setFullScreen(true);
  if (!process.argv.includes('--hidden')) win.show();
  else {
    win.webContents.setAudioMuted(true);
    saveWindowState();
  }
  win.on('close', (e) => { if (!isQuitting) { e.preventDefault(); saveWindowState(); win.hide(); }});
  win.on('resize', saveWindowState);
  win.on('move', saveWindowState);
  win.on('enter-full-screen', saveWindowState);
  win.on('leave-full-screen', saveWindowState);
  win.on('blur', () => win.webContents.setAudioMuted(true));
  win.on('focus', () => win.webContents.setAudioMuted(false));
  win.webContents.on('page-title-updated', (e, title) => {
    if (tray) {
        tray.setToolTip(`${config.displayName || title} (Running)`);
    }
  });
}

ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('open-file-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Select Icon', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'ico'] }]
    });
    return !canceled ? filePaths[0] : undefined;
});
ipcMain.on('open-hotkey-window', createHotkeyWindow);
ipcMain.on('hotkey-selected', (event, hotkey) => {
    if (configWin) configWin.webContents.send('hotkey-updated', hotkey);
    if (hotkeyWin) hotkeyWin.close();
});
ipcMain.on('save-config', (event, newSettings) => {
    const oldConfig = { ...config };
    config = saveConfig(newSettings);
    if (config) {
        // When saving, only update the TRAY icon. The main window icon remains fixed.
        if (newSettings.iconPath && fs.existsSync(newSettings.iconPath)) {
            tray.setImage(newSettings.iconPath);
        }
        if (newSettings.displayName) tray.setToolTip(`${newSettings.displayName} (Running)`);
        if (newSettings.kioskURL !== oldConfig.kioskURL) win.loadURL(newSettings.kioskURL);
        
        if (newSettings.hotkey !== oldConfig.hotkey) {
            if (oldConfig.hotkey) {
                globalShortcut.unregister(oldConfig.hotkey);
            }
            if (newSettings.hotkey) {
                try {
                    globalShortcut.register(newSettings.hotkey, toggleMainWindow);
                } catch (e) {
                    console.error(`Failed to register hotkey "${newSettings.hotkey}":`, e);
                    dialog.showErrorBox('Hotkey Error', `The key combination "${newSettings.hotkey}" is invalid.`);
                }
            }
        }
        if (configWin) configWin.close();
    }
});

app.whenReady().then(() => {
  // Sync the startup setting from the config file to the OS at launch
  app.setLoginItemSettings({
    openAtLogin: config.startWithWindows,
    args: ['--hidden']
  });

  createTray();
  createWindow();
  
  if (config.hotkey) {
    try {
        globalShortcut.register(config.hotkey, toggleMainWindow);
    } catch(e) {
        console.error(`Failed to register initial hotkey "${config.hotkey}":`, e);
    }
  }
  globalShortcut.register('F5', () => win.webContents.reload());
  app.on('activate', () => !win && createWindow());
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
