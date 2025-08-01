let selectedIconPath = null;
let selectedHotkey = null;

const hotkeyDisplay = document.getElementById('hotkey-display');

document.addEventListener('DOMContentLoaded', async () => {
    const currentConfig = await window.api.getConfig();
    document.getElementById('url').value = currentConfig.kioskURL;
    document.getElementById('name').value = currentConfig.displayName;
    selectedIconPath = currentConfig.iconPath;
    selectedHotkey = currentConfig.hotkey;
    hotkeyDisplay.textContent = selectedHotkey || 'No hotkey set';
});

document.getElementById('select-icon-btn').addEventListener('click', async () => {
    const filePath = await window.api.openFileDialog();
    if (filePath) selectedIconPath = filePath;
});

document.getElementById('select-hotkey-btn').addEventListener('click', () => {
    window.api.openHotkeyWindow();
});

window.api.onHotkeyUpdate((hotkey) => {
    selectedHotkey = hotkey;
    hotkeyDisplay.textContent = selectedHotkey || 'No hotkey set';
});

document.getElementById('config-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const newSettings = {
        kioskURL: document.getElementById('url').value,
        displayName: document.getElementById('name').value,
        iconPath: selectedIconPath,
        hotkey: selectedHotkey
    };
    window.api.saveConfig(newSettings);
});

// Adiciona o eventListener para o novo botão "Add New Instance" [9]
document.getElementById('add-new-instance-btn').addEventListener('click', () => {
    // Coleta as configurações atuais do formulário [9]
    const newSettings = {
        kioskURL: document.getElementById('url').value,
        displayName: document.getElementById('name').value,
        iconPath: selectedIconPath,
        hotkey: selectedHotkey
    };
    // Envia essas configurações para o processo principal (`main.js`) para criar uma nova instância [9]
    window.api.createNewInstance(newSettings);
});
