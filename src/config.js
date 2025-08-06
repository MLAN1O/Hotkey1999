let profiles = [];
let selectedProfileId = null;
let selectedHotkey = null;
let availableDisplays = [];
let primaryMonitorId = null;

const profileList = document.getElementById('profile-list');
const profileIdInput = document.getElementById('profile-id');
const urlInput = document.getElementById('url');
const nameInput = document.getElementById('name');
const monitorSelect = document.getElementById('monitor-select');
const hotkeyDisplay = document.getElementById('hotkey-display');
const enableBackgroundThrottlingInput = document.getElementById('enable-background-throttling');
const enableRefreshOnOpenInput = document.getElementById('enable-refresh-on-open');
const muteAudioWhenBlurredInput = document.getElementById('mute-audio-when-blurred');
const hideFromTaskbarInput = document.getElementById('hide-from-taskbar');
const alwaysActiveInput = document.getElementById('always-active');
const themeSelect = document.getElementById('theme-select');

// Function to apply theme to the html element
function applyTheme(theme) {
    document.documentElement.classList.remove('theme-light', 'theme-dark');
    if (theme === 'light') {
        document.documentElement.classList.add('theme-light');
    } else if (theme === 'dark') {
        document.documentElement.classList.add('theme-dark');
    }
}

// Function to show toast messages
function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toast-container') || (() => {
        const div = document.createElement('div');
        div.id = 'toast-container';
        document.body.appendChild(div);
        return div;
    })();

    const toast = document.createElement('div');
    toast.classList.add('toast', `toast-${type}`);
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Automatically remove the toast after 3 seconds
    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
}

// Validation functions
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function isValidDisplayName(name) {
    return name.trim().length > 0;
}

async function loadAvailableDisplays() {
    availableDisplays = await window.api.getAvailableDisplays();
    monitorSelect.innerHTML = '';
    availableDisplays.forEach(display => {
        const option = document.createElement('option');
        option.value = display.id;
        option.textContent = display.label;
        monitorSelect.appendChild(option);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadAvailableDisplays();
    primaryMonitorId = await window.api.getPrimaryMonitorId();
    loadProfiles();

    // Load and apply initial theme
    const { savedTheme, resolvedTheme } = await window.api.getAppTheme();
    themeSelect.value = savedTheme;
    applyTheme(resolvedTheme);
    updateSystemThemeOptionText(resolvedTheme);

    // Listen for theme changes from main process
    window.api.onUpdateTheme((resolvedTheme) => {
        applyTheme(resolvedTheme);
        if (themeSelect.value === 'system') {
            updateSystemThemeOptionText(resolvedTheme);
        }
    });

    function updateSystemThemeOptionText(resolvedTheme) {
        const systemOption = themeSelect.querySelector('option[value="system"]');
        if (systemOption) {
            systemOption.textContent = 'System';
        }
    }
});



async function loadProfiles(profileIdToSelect = null) {
    profiles = await window.api.getProfiles();
    renderProfileList();

    const profileToSelect = profiles.find(p => p.id === profileIdToSelect);

    if (profileToSelect) {
        selectProfile(profileToSelect.id);
    } else if (profiles.length > 0) {
        selectProfile(profiles[0].id);
    } else {
        resetForm();
    }
}

function renderProfileList() {
    profileList.innerHTML = '';
    profiles.forEach(profile => {
        const li = document.createElement('li');
        li.textContent = profile.displayName;
        li.dataset.id = profile.id;
        if (profile.id === selectedProfileId) {
            li.classList.add('selected');
        }
        li.addEventListener('click', () => selectProfile(profile.id));
        profileList.appendChild(li);
    });
}

function selectProfile(profileId) {
    selectedProfileId = profileId;
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
        profileIdInput.value = profile.id;
        urlInput.value = profile.kioskURL;
        nameInput.value = profile.displayName;
        selectedHotkey = profile.hotkey;
        hotkeyDisplay.textContent = selectedHotkey || 'Not set';
        
        // Fix monitor selection logic - validate monitor exists
        const validMonitorId = validateMonitorSelection(profile.monitorId);
        monitorSelect.value = validMonitorId;
        
        // Ensure each checkbox gets its own value - no copy-paste mistakes
        enableBackgroundThrottlingInput.checked = Boolean(profile.enableBackgroundThrottling);
        enableRefreshOnOpenInput.checked = Boolean(profile.enableRefreshOnOpen);
        muteAudioWhenBlurredInput.checked = Boolean(profile.muteAudioWhenBlurred);
        hideFromTaskbarInput.checked = Boolean(profile.hideFromTaskbar);
        alwaysActiveInput.checked = Boolean(profile.alwaysActive);
    }
    renderProfileList();
}

/**
 * Validates and returns a valid monitor ID, falling back to primary if needed.
 * @param {number|null} monitorId The monitor ID to validate.
 * @returns {number} A valid monitor ID.
 */
function validateMonitorSelection(monitorId) {
    // If no monitor ID specified, use primary
    if (monitorId === null || monitorId === undefined) {
        return primaryMonitorId || '';
    }
    
    // Check if the monitor still exists in available displays
    const monitorExists = availableDisplays.some(display => display.id === monitorId);
    if (!monitorExists) {
        console.warn(`Monitor ${monitorId} no longer exists. Falling back to primary monitor.`);
        return primaryMonitorId || '';
    }
    
    return monitorId;
}

function resetForm() {
    profileIdInput.value = '';
    urlInput.value = 'https://www.example.com';
    nameInput.value = 'New Profile';
    selectedHotkey = null;
    hotkeyDisplay.textContent = 'Not set';
    monitorSelect.value = primaryMonitorId || ''; // Set to primary monitor or empty if not found
    
    // Reset each checkbox individually to prevent copy-paste errors
    enableBackgroundThrottlingInput.checked = false;
    enableRefreshOnOpenInput.checked = false;
    muteAudioWhenBlurredInput.checked = true;  // Default: mute when blurred
    hideFromTaskbarInput.checked = false;
    alwaysActiveInput.checked = false;
    
    selectedProfileId = null;
}

document.getElementById('add-profile-btn').addEventListener('click', async () => {
    const newProfileUrl = 'https://www.example.com';
    const newProfileName = 'New Profile';

    if (!isValidUrl(newProfileUrl)) {
        showToast('Invalid default URL for new profile.', 'error');
        return;
    }
    if (!isValidDisplayName(newProfileName)) {
        showToast('Invalid default display name for new profile.', 'error');
        return;
    }

    const profileData = {
        kioskURL: newProfileUrl,
        displayName: newProfileName,
        hotkey: null,
        monitorId: primaryMonitorId // Set default monitor to primary monitor
    };

    const result = await window.api.addProfile(profileData);

    if (result.success) {
        await loadProfiles(result.profile.id);
        showToast('New profile added successfully!', 'success');
    } else {
        showToast(result.error, 'error');
    }
});

document.getElementById('select-hotkey-btn').addEventListener('click', () => {
    window.api.openHotkeyWindow(selectedHotkey);
});

window.api.onHotkeyUpdate((hotkey) => {
    selectedHotkey = hotkey;
    hotkeyDisplay.textContent = selectedHotkey || 'Not set';
});

document.getElementById('config-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const kioskURL = urlInput.value;
    const displayName = nameInput.value;

    if (!isValidUrl(kioskURL)) {
        showToast('Please enter a valid URL (e.g., http://example.com).', 'error');
        return;
    }

    if (!isValidDisplayName(displayName)) {
        showToast('Display Name cannot be empty.', 'error');
        return;
    }

    // Validate monitor selection before saving
    const selectedMonitorId = parseInt(monitorSelect.value) || null;
    const validatedMonitorId = validateMonitorSelection(selectedMonitorId);
    
    const profileData = {
        kioskURL: kioskURL,
        displayName: displayName,
        hotkey: selectedHotkey,
        monitorId: validatedMonitorId,
        // Explicitly read each checkbox to prevent variable mix-ups
        enableBackgroundThrottling: Boolean(enableBackgroundThrottlingInput.checked),
        enableRefreshOnOpen: Boolean(enableRefreshOnOpenInput.checked),
        muteAudioWhenBlurred: Boolean(muteAudioWhenBlurredInput.checked),
        hideFromTaskbar: Boolean(hideFromTaskbarInput.checked),
        alwaysActive: Boolean(alwaysActiveInput.checked)
    };

    let result;
    if (selectedProfileId) {
        result = await window.api.updateProfile(selectedProfileId, profileData);
    } else {
        result = await window.api.addProfile(profileData);
    }

    if (result.success) {
        const idToSelect = selectedProfileId || (result.profile ? result.profile.id : null);
        await loadProfiles(idToSelect);

        // Check if only theme was changed
        const oldTheme = await window.api.getAppTheme();
        const newTheme = themeSelect.value;

        // Determine if any profile data other than theme has changed
        const currentProfile = profiles.find(p => p.id === selectedProfileId);
        const profileDataChanged = currentProfile && (
            currentProfile.kioskURL !== kioskURL ||
            currentProfile.displayName !== displayName ||
            currentProfile.hotkey !== selectedHotkey ||
            currentProfile.monitorId !== (parseInt(monitorSelect.value) || null) ||
            currentProfile.enableBackgroundThrottling !== enableBackgroundThrottlingInput.checked ||
            currentProfile.enableRefreshOnOpen !== enableRefreshOnOpenInput.checked ||
            currentProfile.muteAudioWhenBlurred !== muteAudioWhenBlurredInput.checked ||
            currentProfile.hideFromTaskbar !== hideFromTaskbarInput.checked ||
            currentProfile.alwaysActive !== alwaysActiveInput.checked
        );

        if (!profileDataChanged && oldTheme.savedTheme !== newTheme) {
            showToast('Theme has been updated!', 'success');
        } else {
            showToast('Profile saved successfully!', 'success');
        }

        // Save theme
        await window.api.setAppTheme(newTheme);

        // After saving, get the resolved theme and apply it immediately
        const { resolvedTheme } = await window.api.getAppTheme();
        applyTheme(resolvedTheme);
        updateSystemThemeOptionText(resolvedTheme);

    } else {
        showToast(result.error, 'error');
    }
});

document.getElementById('delete-profile-btn').addEventListener('click', async () => {
    if (!selectedProfileId) return;

    const result = await window.api.deleteProfile(selectedProfileId);
    if (result.success) {
        loadProfiles();
        showToast('Profile deleted successfully!', 'success');
    } else {
        showToast(result.error, 'error');
    }
});

// Check for updates functionality
document.getElementById('check-updates-btn').addEventListener('click', () => {
    const githubReleasesUrl = 'https://github.com/mlan1o/Hotkey1999/releases';
    window.api.openExternal(githubReleasesUrl);
});

// Load version from package.json dynamically
async function loadAppVersion() {
    try {
        const version = await window.api.getAppVersion();
        document.getElementById('app-version').textContent = `v${version}`;
    } catch (error) {
        console.error('Failed to load app version:', error);
        // Keep the hardcoded version as fallback
    }
}

// Load version when page loads
document.addEventListener('DOMContentLoaded', loadAppVersion);

