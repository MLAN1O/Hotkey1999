// ConfigManager.js
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class ConfigManager {
    constructor() {
        this.userDataPath = app.getPath('userData');
    }

    /**
     * Determines the configuration file path based on the instance ID.
     * @param {string} instanceId The ID of the instance.
     * @returns {string} The full path to the configuration file.
     */
    getInstanceConfigPath(instanceId) {
        const effectiveInstanceId = instanceId || 'default';
        return path.join(this.userDataPath, `config-${effectiveInstanceId}.json`);
    }

    /**
     * Loads the configuration for a specific instance.
     * @param {string} instanceId The ID of the instance.
     * @returns {object} The configuration object.
     */
    loadConfig(instanceId) {
        const configPath = this.getInstanceConfigPath(instanceId);
        let config = {};
        try {
            if (fs.existsSync(configPath)) {
                config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            } else {
                // Default configuration for a new instance
                config = {
                    kioskURL: 'https://en.wikipedia.org/wiki/Space_Invaders_(Atari_2600_video_game)',
                    hotkey: 'Home',
                    displayName: `HotkeyMyURLInstance-${instanceId || 'Default'}`,
                    iconPath: path.join(__dirname, 'assets/icon.png'),
                    startWithWindows: false
                };
            }
        } catch (error) {
            console.error(`Error loading config for instance ${instanceId} from ${configPath}:`, error);
            // Fallback configuration in case of errors
            config = {
                kioskURL: 'https://example.com/error',
                hotkey: '',
                displayName: `Error Loading Config`,
                iconPath: path.join(__dirname, 'icon.png'),
                startWithWindows: false
            };
        }
        config.instanceId = instanceId;
        return config;
    }

    /**
     * Saves the configuration for an existing instance.
     * @param {object} newConfig The new settings.
     * @param {string} instanceId The ID of the instance.
     * @returns {object|null} The updated configuration object or null on failure.
     */
    saveConfig(newConfig, instanceId) {
        const configPath = this.getInstanceConfigPath(instanceId);
        try {
            const currentInstanceConfig = this.loadConfig(instanceId);
            const updatedConfig = { ...currentInstanceConfig, ...newConfig };
            fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
            console.log(`Configuration UPDATED for instance ${instanceId} at: ${configPath}`);
            return updatedConfig;
        } catch (error) {
            console.error(`Failed to save configuration for instance ${instanceId}:`, error);
            return null;
        }
    }

    /**
     * Creates and saves the configuration file for a NEW instance.
     * @param {object} initialConfig The complete initial configuration object.
     * @param {string} instanceId The ID of the new instance.
     * @returns {object|null} The saved configuration object or null on failure.
     */
    createInstanceConfig(initialConfig, instanceId) {
        const configPath = this.getInstanceConfigPath(instanceId);
        try {
            fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2));
            console.log(`Initial configuration created for new instance ${instanceId} at: ${configPath}`);
            return initialConfig;
        } catch (error) {
            console.error(`Failed to create configuration for new instance ${instanceId}:`, error);
            return null;
        }
    }

    /**
     * Checks if a hotkey is already in use by another instance.
     * @param {string} hotkey The hotkey to check.
     * @param {string} currentInstanceId The ID of the current instance (to be ignored in the check).
     * @returns {{isDuplicate: boolean, conflictingInstance: string|null}}
     */
    isHotkeyDuplicate(hotkey, currentInstanceId) {
        if (!hotkey) {
            return { isDuplicate: false, conflictingInstance: null };
        }

        const allConfigFiles = fs.readdirSync(this.userDataPath).filter(f => f.startsWith('config-') && f.endsWith('.json'));

        for (const file of allConfigFiles) {
            const instanceId = file.replace('config-', '').replace('.json', '');
            if (instanceId === currentInstanceId) {
                continue; // Skip self-check
            }
            try {
                const configContent = JSON.parse(fs.readFileSync(path.join(this.userDataPath, file), 'utf-8'));
                if (configContent.hotkey === hotkey) {
                    const instanceName = configContent.displayName || `ID: ${instanceId}`;
                    return { isDuplicate: true, conflictingInstance: instanceName };
                }
            } catch (e) {
                console.error(`Error reading config file ${file}:`, e);
            }
        }
        return { isDuplicate: false, conflictingInstance: null };
    }
}

module.exports = ConfigManager;
