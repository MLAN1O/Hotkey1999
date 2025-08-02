let profiles = [];
let selectedProfileId = null;
let selectedHotkey = null;

const profileList = document.getElementById('profile-list');
const profileIdInput = document.getElementById('profile-id');
const urlInput = document.getElementById('url');
const nameInput = document.getElementById('name');
const hotkeyDisplay = document.getElementById('hotkey-display');
const errorMessage = document.getElementById('error-message');

document.addEventListener('DOMContentLoaded', async () => {
    loadProfiles();
});

async function loadProfiles() {
    profiles = await window.api.getProfiles();
    renderProfileList();
    if (profiles.length > 0) {
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
        errorMessage.style.display = 'none';
    }
    renderProfileList();
}

function resetForm() {
    profileIdInput.value = '';
    urlInput.value = 'https://example.com';
    nameInput.value = 'New Profile';
    selectedHotkey = null;
    hotkeyDisplay.textContent = 'Not set';
    errorMessage.style.display = 'none';
    selectedProfileId = null;
}

document.getElementById('add-profile-btn').addEventListener('click', async () => {
    const profileData = {
        kioskURL: 'https://example.com',
        displayName: 'New Profile',
        hotkey: null
    };

    const result = await window.api.addProfile(profileData);

    if (result.success) {
        await loadProfiles();
        selectProfile(result.profile.id);
    } else {
        errorMessage.textContent = result.error;
        errorMessage.style.display = 'block';
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
    errorMessage.style.display = 'none';

    const profileData = {
        kioskURL: urlInput.value,
        displayName: nameInput.value,
        hotkey: selectedHotkey
    };

    let result;
    if (selectedProfileId) {
        result = await window.api.updateProfile(selectedProfileId, profileData);
    } else {
        result = await window.api.addProfile(profileData);
    }

    if (result.success) {
        loadProfiles();
        if (result.profile) {
            selectProfile(result.profile.id);
        }
    } else {
        errorMessage.textContent = result.error;
        errorMessage.style.display = 'block';
    }
});

document.getElementById('delete-profile-btn').addEventListener('click', async () => {
    if (!selectedProfileId) return;

    const result = await window.api.deleteProfile(selectedProfileId);
    if (result.success) {
        loadProfiles();
    } else {
        errorMessage.textContent = result.error;
        errorMessage.style.display = 'block';
    }
});

