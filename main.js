// main.js
const { app, BrowserWindow, globalShortcut, Menu, Tray, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const child_process = require('child_process'); // Necessário para lançar novos processos [1]
const crypto = require('crypto'); // Necessário para gerar IDs únicos [1]

// Variável global para armazenar o ID da instância atual
let currentInstanceId = null;

/**
 * Determina o caminho do arquivo de configuração com base no ID da instância.
 * Cada instância terá seu próprio arquivo de configuração (ex: config-kiosk1.json). [2]
 * @param {string} instanceId O ID da instância para a qual obter o caminho da configuração.
 * @returns {string} O caminho completo para o arquivo de configuração da instância.
 */
function getInstanceConfigPath(instanceId) {
    // Se nenhum ID for fornecido (ex: primeira inicialização sem argumentos), usa um ID padrão.
    // Isso garante que sempre haja um arquivo de configuração para a instância "principal" ou padrão.
    const effectiveInstanceId = instanceId || 'default';
    // Os arquivos de configuração são armazenados no diretório de dados do usuário do aplicativo. [2]
    return path.join(app.getPath('userData'), `config-${effectiveInstanceId}.json`);
}

/**
 * Carrega a configuração para uma instância específica.
 * @param {string} [instanceIdToLoad=currentInstanceId] O ID da instância cuja configuração deve ser carregada.
 * @returns {object} O objeto de configuração.
 */
function loadConfig(instanceIdToLoad = currentInstanceId) {
    const configPath = getInstanceConfigPath(instanceIdToLoad);
    let config = {};
    try {
        if (fs.existsSync(configPath)) {
            console.log(`Carregando configuração de: ${configPath}`);
            config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } else {
            // Configuração padrão se nenhum arquivo de configuração for encontrado.
            console.log(`Nenhuma configuração encontrada para a instância ${instanceIdToLoad}. Usando padrão.`);
            config = {
                kioskURL: 'https://en.wikipedia.org/wiki/Space_Invaders_(Atari_2600_video_game)',
                hotkey: 'Home',
                displayName: `HotkeyMyURLInstance-${instanceIdToLoad || 'Default'}`,
                iconPath: path.join(__dirname, 'icon.png'),
                startWithWindows: false
            };
        }
    } catch (error) {
        console.error(`Erro ao carregar config para a instância ${instanceIdToLoad} de ${configPath}:`, error);
        // Retorna um objeto de configuração de emergência em caso de erro de parse.
        config = {
            kioskURL: 'https://example.com/error',
            hotkey: '',
            displayName: `Error Loading Config`,
            iconPath: path.join(__dirname, 'icon.png'),
            startWithWindows: false
        };
    }
    // Adiciona o ID da instância ao objeto de configuração retornado.
    // Isso garante que o renderer sempre saiba qual instância está editando.
    config.instanceId = instanceIdToLoad;
    return config;
}

/**
 * Salva a nova configuração para uma instância específica.
 * @param {object} newConfig As novas configurações a serem salvas.
 * @param {string} [instanceIdToSave=currentInstanceId] O ID da instância cuja configuração deve ser salva.
 * @returns {object|null} O objeto de configuração atualizado ou null em caso de falha.
 */
/**
 * ATUALIZA a configuração para uma instância existente. Usado por 'Save and Apply'.
 * @param {object} newConfig As novas configurações a serem salvas.
 * @param {string} [instanceIdToSave=currentInstanceId] O ID da instância cuja configuração deve ser salva.
 * @returns {object|null} O objeto de configuração atualizado ou null em caso de falha.
 */
function saveConfig(newConfig, instanceIdToSave = currentInstanceId) {
    const configPath = getInstanceConfigPath(instanceIdToSave);
    try {
        // Carrega a configuração existente da instância específica para mesclar com as novas configurações.
        const currentInstanceConfig = loadConfig(instanceIdToSave);
        const updatedConfig = { ...currentInstanceConfig, ...newConfig };
        fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
        console.log(`Configuração ATUALIZADA para a instância ${instanceIdToSave} em: ${configPath}`);
        return updatedConfig;
    } catch (error) {
        console.error(`Falha ao salvar configuração para a instância ${instanceIdToSave}:`, error);
        return null;
    }
}

/**
 * CRIA e salva o arquivo de configuração para uma NOVA instância. Usado por 'Add New Instance'.
 * Garante que a nova instância seja criada com as configurações exatas fornecidas, sem mesclar com padrões.
 * @param {object} initialConfig O objeto de configuração inicial completo para a nova instância.
 * @param {string} instanceId O ID da nova instância.
 * @returns {object|null} O objeto de configuração salvo ou null em caso de falha.
 */
function createInstanceConfig(initialConfig, instanceId) {
    const configPath = getInstanceConfigPath(instanceId);
    try {
        // O objeto `initialConfig` vindo do renderer já é o estado desejado completo.
        // Inclui startWithWindows, kioskURL, displayName, etc.
        fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2));
        console.log(`Configuração inicial criada para a nova instância ${instanceId} em: ${configPath}`);
        return initialConfig;
    } catch (error) {
        console.error(`Falha ao criar configuração para a nova instância ${instanceId}:`, error);
        return null;
    }
}

// **Início da Lógica de Inicialização da Instância**
// O main.js precisa aceitar um identificador de instância (Instance ID) via argumento de linha de comando. [2]
const args = process.argv;
for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--instanceId=')) {
        currentInstanceId = args[i].split('=')[1];
        break;
    }
}

// Se nenhum instanceId foi passado, esta é provavelmente a primeira inicialização ou uma instância padrão.
// Definimos um ID padrão para que a instância principal possa funcionar sem argumentos específicos.
if (!currentInstanceId) {
    currentInstanceId = 'default';
    console.log(`Nenhum ID de instância fornecido, usando padrão: ${currentInstanceId}`);
}

// Carrega a configuração para o ID da instância atual imediatamente após determiná-lo.
let config = loadConfig(currentInstanceId);

// Variáveis globais para janelas e bandeja do sistema.
let win, configWin, hotkeyWin, tray;
let lastWindowState = {};
let isQuitting = false; // Flag para controlar o encerramento do aplicativo.

/**
 * Alterna a visibilidade da janela principal (esconder/restaurar).
 */
function toggleMainWindow() {
    if (!win) return;
    win.isVisible() ? win.hide() : restoreWindow();
}

// Desabilita a aceleração de hardware e configura a política de autoplay para a janela principal.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

/**
 * Cria o ícone na bandeja do sistema. Cada instância terá seu próprio ícone na bandeja. [3]
 */
function createTray() {
    // O ícone da bandeja pode ser personalizado pelo usuário. O padrão é icon.png.
    const trayIconPath = fs.existsSync(config.iconPath) ? config.iconPath : path.join(__dirname, 'icon.png');
    tray = new Tray(trayIconPath);
    // Exibe o ID da instância no tooltip para fácil identificação.
    tray.setToolTip(`${config.displayName} (Running...)`);

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Open', click: restoreWindow },
        { label: 'Settings', click: createConfigWindow },
        {
            label: 'Start with Windows',
            type: 'checkbox',
            checked: config.startWithWindows, // Lê o estado da configuração da instância atual.
            click: (menuItem) => {
                const startWithWindows = menuItem.checked;
                // [3] "A função app.setLoginItemSettings() em Electron geralmente registra o aplicativo principal para iniciar com o sistema operacional. Como o appId é único (...), você não pode simplesmente registrar o mesmo aplicativo várias vezes com setLoginItemSettings para diferentes configurações."
                // [3] "Para que cada instância inicie com o Windows, seria necessário um controle mais granular sobre as configurações de inicialização do sistema operacional. Isso pode envolver: Criação manual de atalhos (...) ou Manipulação do Registro do Windows."
                // A implementação abaixo registra a *instância atual* para iniciar com o Windows.
                // Note que para *novas instâncias* criadas, a lógica de inicialização com o Windows é mais complexa e deve ser gerenciada externamente.
                app.setLoginItemSettings({
                    openAtLogin: startWithWindows,
                    args: ['--hidden', `--instanceId=${currentInstanceId}`] // Passa o ID da instância para os argumentos de inicialização
                });
                saveConfig({ startWithWindows: startWithWindows }); // Salva o novo estado na configuração da instância.
                config.startWithWindows = startWithWindows; // Atualiza o objeto de configuração em memória.
            }
        },
        { type: 'separator' },
        { label: 'Exit', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('click', restoreWindow);
}

/**
 * Cria ou foca a janela de configurações.
 */
function createConfigWindow() {
    if (configWin) return configWin.focus();
    configWin = new BrowserWindow({
        width: 1024, height: 768, title: `Settings for Instance: ${currentInstanceId}`, autoHideMenuBar: true,
        webPreferences: { preload: path.join(__dirname, 'preload-config.js') }
    });
    configWin.loadFile('config.html');
    configWin.on('closed', () => { configWin = null; });
}

/**
 * Cria ou foca a janela de seleção de hotkey.
 */
function createHotkeyWindow() {
    if (hotkeyWin) return hotkeyWin.focus();
    hotkeyWin = new BrowserWindow({
        width: 1024, height: 768, title: 'Select Hotkey', parent: configWin, modal: true,
        autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload-hotkey.js') }
    });
    hotkeyWin.loadFile('hotkey.html');
    hotkeyWin.on('closed', () => { hotkeyWin = null; });
}

/**
 * Restaura e foca a janela principal.
 */
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

/**
 * Salva o estado da janela principal (se está em tela cheia, tamanho e posição).
 */
function saveWindowState() {
    if (!win) return;
    lastWindowState.isFullScreen = win.isFullScreen();
    if (!win.isMinimized()) lastWindowState.bounds = win.getBounds();
}

/**
 * Cria a janela principal que exibe a URL configurada.
 */
function createWindow() {
    // O ícone da janela principal e da barra de tarefas é sempre icon.ico.
    const appIconPath = path.join(__dirname, 'icon.ico');

    win = new BrowserWindow({
        show: false, width: 1024, height: 768, autoHideMenuBar: true, icon: appIconPath,
        webPreferences: { backgroundThrottling: false }
    });
    win.loadURL(config.kioskURL);
    win.setFullScreen(true);
    // Se a aplicação não foi iniciada com o argumento '--hidden', mostra a janela.
    if (!process.argv.includes('--hidden')) win.show();
    else {
        win.webContents.setAudioMuted(true);
        saveWindowState();
    }
    // Manipuladores de eventos para a janela principal.
    win.on('close', (e) => { if (!isQuitting) { e.preventDefault(); saveWindowState(); win.hide(); } });
    win.on('resize', saveWindowState);
    win.on('move', saveWindowState);
    win.on('enter-full-screen', saveWindowState);
    win.on('leave-full-screen', saveWindowState);
    win.on('blur', () => win.webContents.setAudioMuted(true));
    win.on('focus', () => win.webContents.setAudioMuted(false));
    win.webContents.on('page-title-updated', (e, title) => {
        if (tray) {
            tray.setToolTip(`${config.displayName || title} (Running)`); // Atualiza o tooltip com o ID da instância
        }
    });
}

// **Manipuladores IPC (Inter-Process Communication)**

// Retorna a configuração da instância atual para o processo de renderização. [4]
ipcMain.handle('get-config', () => loadConfig(currentInstanceId));

// Abre a caixa de diálogo para seleção de ícone. [5, 6]
ipcMain.handle('open-file-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Select Icon', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'ico'] }]
    });
    return !canceled ? filePaths : undefined;
});

// Abre a janela de seleção de hotkey. [6]
ipcMain.on('open-hotkey-window', createHotkeyWindow);

// Recebe a hotkey selecionada da janela de hotkey e a envia para a janela de configurações. [6]
ipcMain.on('hotkey-selected', (event, hotkey) => {
    if (configWin) configWin.webContents.send('hotkey-updated', hotkey);
    if (hotkeyWin) hotkeyWin.close();
});

// Salva a configuração atual da instância. [6-8]
ipcMain.handle('save-config', (event, newSettings) => {
    // Validação de Hotkey Duplicada, excluindo a própria instância
    const userDataPath = app.getPath('userData');
    const allConfigFiles = fs.readdirSync(userDataPath).filter(f => f.startsWith('config-') && f.endsWith('.json'));

    for (const file of allConfigFiles) {
        const instanceId = file.replace('config-', '').replace('.json', '');
        if (instanceId === currentInstanceId) {
            continue; // Pula a verificação para a instância atual
        }
        try {
            const configContent = JSON.parse(fs.readFileSync(path.join(userDataPath, file), 'utf-8'));
            if (newSettings.hotkey && configContent.hotkey === newSettings.hotkey) {
                const instanceName = configContent.displayName || 'Unnamed';
                return { 
                    success: false, 
                    error: `Hotkey is already in use by "${instanceName}" [ID: ${instanceId}]. Please choose another.` 
                };
            }
        } catch (e) {
            console.error(`Erro ao ler o arquivo de configuração ${file}:`, e);
        }
    }

    // Se a validação passar, continua com o salvamento
    const oldConfig = { ...config };
    config = saveConfig(newSettings, currentInstanceId);

    if (config) {
        if (newSettings.iconPath && fs.existsSync(newSettings.iconPath)) {
            tray.setImage(newSettings.iconPath);
        }
        if (newSettings.displayName) {
            tray.setToolTip(`${newSettings.displayName} (Running)`);
        }
        if (newSettings.kioskURL !== oldConfig.kioskURL) {
            win.loadURL(newSettings.kioskURL);
        }
        if (newSettings.hotkey !== oldConfig.hotkey) {
            if (oldConfig.hotkey) {
                globalShortcut.unregister(oldConfig.hotkey);
            }
            if (newSettings.hotkey) {
                try {
                    globalShortcut.register(newSettings.hotkey, toggleMainWindow);
                } catch (e) {
                    console.error(`Falha ao registrar hotkey "${newSettings.hotkey}" para a instância ${currentInstanceId}:`, e);
                    return { success: false, error: `Hotkey "${newSettings.hotkey}" is invalid or used by another application.` };
                }
            }
        }
        if (configWin) configWin.close();
        return { success: true };
    } else {
        return { success: false, error: 'Failed to save settings.' };
    }
});

// **Novo IPC para Criar uma Nova Instância**
// [9] "Em main.js, você adicionaria um listener para o novo canal IPC (ex: create-new-instance)."
ipcMain.handle('create-new-instance', async (event, newInstanceSettings) => {
    // Validação de Hotkey Duplicada
    const userDataPath = app.getPath('userData');
    const allConfigFiles = fs.readdirSync(userDataPath).filter(f => f.startsWith('config-') && f.endsWith('.json'));

    for (const file of allConfigFiles) {
        try {
            const configContent = JSON.parse(fs.readFileSync(path.join(userDataPath, file), 'utf-8'));
            if (newInstanceSettings.hotkey && configContent.hotkey === newInstanceSettings.hotkey) {
                const instanceId = file.replace('config-', '').replace('.json', '');
                const instanceName = configContent.displayName || 'Unnamed';
                return { 
                    success: false, 
                    error: `Hotkey is already in use by "${instanceName}" [ID: ${instanceId}]. Please choose another.` 
                };
            }
        } catch (e) {
            console.error(`Erro ao ler o arquivo de configuração ${file}:`, e);
        }
    }

    const newInstanceId = crypto.randomUUID().substring(0, 8);

    // Usa a nova função para criar o arquivo de configuração da nova instância sem mesclar com padrões.
    const savedNewConfig = createInstanceConfig(newInstanceSettings, newInstanceId);

    if (savedNewConfig) {
        // Prepara os argumentos para a nova instância, diferenciando entre desenvolvimento e produção.
        const argsForNewInstance = [`--instanceId=${newInstanceId}`];
        if (!app.isPackaged) {
            // Em desenvolvimento, precisamos dizer ao Electron para executar o diretório do aplicativo atual.
            argsForNewInstance.unshift(app.getAppPath());
        }

        // `process.execPath` é a forma mais robusta de obter o caminho para o executável
        // (seja o electron.exe em dev ou o seuapp.exe em produção).
        const executablePath = process.execPath;

        console.log(`Lançando nova instância: ${executablePath} ${argsForNewInstance.join(' ')}`);

        // Lança o novo processo com os argumentos corretos.
        const newProcess = child_process.spawn(executablePath, argsForNewInstance, {
            detached: true, // Permite que o processo pai (esta instância) saia independentemente
            stdio: 'ignore' // Desvincula stdin/out/err do processo pai
        });

        newProcess.unref(); // Permite que o processo pai saia sem esperar pelo filho.

        // [1] "Registrar para Inicialização com Windows (se aplicável): Se a nova instância também for configurada para iniciar com o Windows, o main.js precisaria adicionar a entrada de inicialização correspondente para este novo processo no sistema operacional."
        // [3] "Para que cada instância inicie com o Windows, seria necessário um controle mais granular sobre as configurações de inicialização do sistema operacional. Isso pode envolver: Criação manual de atalhos (...) ou Manipulação do Registro do Windows."
        // A função `app.setLoginItemSettings()` do Electron é limitada a um único `appId` [3] e não pode ser usada para registrar múltiplas instâncias independentes diretamente.
        // A lógica para "Iniciar com o Windows" para a *nova* instância precisaria ser implementada aqui,
        // potencialmente criando um atalho `.lnk` na pasta de inicialização do Windows
        // ou adicionando uma entrada no Registro do Windows para o `electronPath` com os `argsForNewInstance`.
        // Isso está fora do escopo de um exemplo de código direto do `main.js` devido à complexidade específica do SO.
        if (savedNewConfig.startWithWindows) {
            console.warn(`"Iniciar com o Windows" para a nova instância '${newInstanceId}' requer implementação manual específica do SO (por exemplo, criação de atalho .lnk ou entrada de Registro), pois app.setLoginItemSettings do Electron é limitado a um appId por aplicativo.`);
            // Exemplo de como você *poderia* chamar uma função auxiliar para lógica específica do Windows:
            // registerInstanceForStartup(newInstanceId, electronPath, argsForNewInstance);
        }

        // Fecha a janela de configurações após criar uma nova instância.
        if (configWin) configWin.close();

        return { success: true };

    } else {
        return { success: false, error: 'Failed to save the new instance configuration.' };
    }
});


// **Eventos do Ciclo de Vida do Aplicativo Electron**

app.whenReady().then(() => {
    // Sincroniza a configuração de inicialização do arquivo de configuração com o sistema operacional ao iniciar. [8]
    // Isso se aplica à instância *atual* que está sendo iniciada.
    app.setLoginItemSettings({
        openAtLogin: config.startWithWindows,
        args: ['--hidden', `--instanceId=${currentInstanceId}`] // Garante que o ID da instância seja passado.
    });

    createTray(); // Cria o ícone da bandeja para esta instância.
    createWindow(); // Cria a janela principal para esta instância.

    // Registra a hotkey global para esta instância. [8]
    if (config.hotkey) {
        try {
            globalShortcut.register(config.hotkey, toggleMainWindow);
            console.log(`Hotkey registrada para a instância ${currentInstanceId}: ${config.hotkey}`);
        } catch (e) {
            console.error(`Falha ao registrar a hotkey inicial "${config.hotkey}" para a instância ${currentInstanceId}:`, e);
            dialog.showErrorBox('Erro de Hotkey Inicial', `A hotkey "${config.hotkey}" para a instância "${currentInstanceId}" não pôde ser registrada. Pode ser inválida ou estar em uso.`);
        }
    }
    // Hotkey de depuração.
    globalShortcut.register('F5', () => win.webContents.reload());
    // No macOS, se o dock é clicado e não há janelas, recria a janela.
    app.on('activate', () => !win && createWindow());
});

// Desregistra todas as hotkeys globais quando o aplicativo está prestes a sair. [10]
app.on('will-quit', () => {
    console.log(`Instância ${currentInstanceId} está saindo. Desregistrando todos os atalhos.`);
    globalShortcut.unregisterAll();
});

// Fecha o aplicativo quando todas as janelas estão fechadas, exceto no macOS. [10]
// Para um aplicativo de múltiplas instâncias, isso significa que este *processo específico* será encerrado
// se todas as suas janelas (principal, config, hotkey) forem fechadas.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !isQuitting) {
        // Se a janela principal está configurada para apenas 'esconder' e não 'fechar',
        // este evento só será acionado se as janelas de configuração/hotkey forem fechadas e a principal estiver oculta.
        // `app.quit()` aqui encerraria este processo Electron específico.
        app.quit();
    }
});
