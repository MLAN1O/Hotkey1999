let selectedIconPath = null;
let selectedHotkey = null;

const hotkeyDisplay = document.getElementById('hotkey-display');

document.addEventListener('DOMContentLoaded', async () => {
    const currentConfig = await window.api.getConfig();
    // Exibe o ID da instância na UI.
    document.getElementById('instance-id-display').textContent = currentConfig.instanceId || 'default';
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

document.getElementById('config-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const hotkeyError = document.getElementById('hotkey-error');
    hotkeyError.style.display = 'none';

    const newSettings = {
        kioskURL: document.getElementById('url').value,
        displayName: document.getElementById('name').value,
        iconPath: selectedIconPath,
        hotkey: selectedHotkey
    };

    const result = await window.api.saveConfig(newSettings);

    if (!result.success) {
        hotkeyError.textContent = result.error;
        hotkeyError.style.display = 'block';
    }
});

document.getElementById('add-new-instance-btn').addEventListener('click', async () => {
    const hotkeyError = document.getElementById('hotkey-error');
    hotkeyError.style.display = 'none'; // Oculta a mensagem de erro anterior

    const currentConfig = await window.api.getConfig();
    const formSettings = {
        kioskURL: document.getElementById('url').value,
        displayName: document.getElementById('name').value,
        iconPath: selectedIconPath,
        hotkey: selectedHotkey
    };
    const newInstanceSettings = { ...currentConfig, ...formSettings };

    // Invoca a função e aguarda o resultado.
    const result = await window.api.createNewInstance(newInstanceSettings);

    if (!result.success) {
        // Se houver um erro, exibe-o no elemento de erro de hotkey.
        hotkeyError.textContent = result.error;
        hotkeyError.style.display = 'block';
    } else {
        // Se for bem-sucedido, a janela de configuração será fechada pelo processo principal.
    }
});
