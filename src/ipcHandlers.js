// ipcHandlers.js
const { ipcMain, dialog, app } = require('electron');
const crypto = require('crypto');
const child_process = require('child_process');

function registerIpcHandlers(configManager, mainApp) {
    // Handler to get the current configuration for the instance.
    ipcMain.handle('get-config', () => configManager.loadConfig(mainApp.getCurrentInstanceId()));

    // Handler to open a file dialog for selecting an icon.
    ipcMain.handle('open-file-dialog', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Select Icon',
            properties: ['openFile'],
            filters: [{ name: 'Images', extensions: ['png', 'ico'] }]
        });
        return !canceled ? filePaths[0] : undefined;
    });

    // Handler to open the hotkey selection window.
    ipcMain.on('open-hotkey-window', () => mainApp.createHotkeyWindow());

    // Handler for when a hotkey is selected in the hotkey window.
    ipcMain.on('hotkey-selected', (event, hotkey) => {
        mainApp.sendHotkeyToConfigWindow(hotkey);
        mainApp.closeHotkeyWindow();
    });

    // Handler to save the updated configuration.
    ipcMain.handle('save-config', (event, newSettings) => {
        const currentInstanceId = mainApp.getCurrentInstanceId();
        const { isDuplicate, conflictingInstance } = configManager.isHotkeyDuplicate(newSettings.hotkey, currentInstanceId);
        if (isDuplicate) {
            return {
                success: false,
                error: `Hotkey is already in use by "${conflictingInstance}". Please choose another.`
            };
        }

        const oldConfig = { ...mainApp.getConfig() };
        const newConfig = configManager.saveConfig(newSettings, currentInstanceId);

        if (newConfig) {
            mainApp.updateAppWithNewConfig(oldConfig, newConfig);
            mainApp.closeConfigWindow();
            return { success: true };
        } else {
            return { success: false, error: 'Failed to save settings.' };
        }
    });

    // Handler to create a new application instance.
    ipcMain.handle('create-new-instance', async (event, newInstanceSettings) => {
        const { isDuplicate, conflictingInstance } = configManager.isHotkeyDuplicate(newInstanceSettings.hotkey, null);
        if (isDuplicate) {
            return {
                success: false,
                error: `Hotkey is already in use by "${conflictingInstance}". Please choose another.`
            };
        }

        const newInstanceId = crypto.randomUUID().substring(0, 8);
        const savedNewConfig = configManager.createInstanceConfig(newInstanceSettings, newInstanceId);

        if (savedNewConfig) {
            const argsForNewInstance = [`--instanceId=${newInstanceId}`];
            if (!app.isPackaged) {
                // Add the app path to the arguments when in development mode
                argsForNewInstance.unshift(app.getAppPath());
            }

            const executablePath = process.execPath;
            const newProcess = child_process.spawn(executablePath, argsForNewInstance, {
                detached: true,
                stdio: 'ignore'
            });
            newProcess.unref();

            if (savedNewConfig.startWithWindows) {
                // This requires OS-specific implementation and might need user interaction or admin rights.
                console.warn(`"Start with Windows" for new instance '${newInstanceId}' requires manual OS-specific implementation.`);
            }

            mainApp.closeConfigWindow();
            return { success: true };
        } else {
            return { success: false, error: 'Failed to save the new instance configuration.' };
        }
    });
}

module.exports = { registerIpcHandlers };
