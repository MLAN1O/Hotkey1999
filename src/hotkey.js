document.addEventListener('DOMContentLoaded', async () => {
    const state = { modifiers: new Set(), mainKey: null, specialKey: null };
    const keyboardWrapper = document.querySelector('.keyboard-wrapper');
    const dropdownToggle = document.querySelector('.dropdown-toggle');
    const dropdownMenu = document.querySelector('.dropdown-menu');
    const dropdownItems = document.querySelectorAll('.dropdown-item');

    // Function to apply theme to the html element
    function applyTheme(theme) {
        document.documentElement.classList.remove('theme-light', 'theme-dark');
        if (theme === 'light') {
            document.documentElement.classList.add('theme-light');
        } else if (theme === 'dark') {
            document.documentElement.classList.add('theme-dark');
        }
    }

    // --- State Initialization ---
    const params = new URLSearchParams(window.location.search);
    const currentHotkey = params.get('hotkey');
    if (currentHotkey) {
        const parts = currentHotkey.split('+');
        parts.forEach(part => {
            const normalizedPart = part.replace('CommandOrControl', 'Ctrl').replace('CmdOrCtrl', 'Ctrl');
            if (['Ctrl', 'Alt', 'Shift'].includes(normalizedPart)) {
                state.modifiers.add(normalizedPart);
            } else if (document.querySelector(`.key[data-key="${normalizedPart}"]`)) {
                state.mainKey = normalizedPart;
            } else {
                state.specialKey = normalizedPart;
            }
        });
    }

    // --- UI Update Function ---
    function updateSelection() {
        document.querySelectorAll('.key').forEach(keyEl => {
            const key = keyEl.dataset.key;
            if (!key) return;

            const isModifier = ['Ctrl', 'Alt', 'Shift'].includes(key);
            if (isModifier) {
                keyEl.classList.toggle('selected', state.modifiers.has(key));
            } else {
                keyEl.classList.toggle('selected', state.mainKey === key);
            }
        });

        // Update dropdown UI
        const buttonText = dropdownToggle.querySelector('span:first-child');
        if (state.specialKey) {
            const selectedItem = document.querySelector(`.dropdown-item[data-special-key="${state.specialKey}"]`);
            if (selectedItem) {
                buttonText.textContent = selectedItem.textContent;
                dropdownToggle.classList.add('has-selection');
                dropdownItems.forEach(i => i.classList.remove('selected'));
                selectedItem.classList.add('selected');
            }
        } else {
            buttonText.textContent = 'Special Keys';
            dropdownToggle.classList.remove('has-selection');
            dropdownItems.forEach(i => i.classList.remove('selected'));
        }
    }

    // --- Event Handlers ---
    function handleKeyClick(event) {
        const keyEl = event.target.closest('.key');
        if (!keyEl) return;

        const key = keyEl.dataset.key;
        if (!key) return;

        const isModifier = ['Ctrl', 'Alt', 'Shift'].includes(key);
        if (isModifier) {
            state.modifiers.has(key) ? state.modifiers.delete(key) : state.modifiers.add(key);
        } else {
            state.mainKey = state.mainKey === key ? null : key;
        }
        updateSelection();
    }

    function handleDropdownItemClick(event) {
        const item = event.target;
        const specialKey = item.getAttribute('data-special-key');

        if (specialKey === 'none') {
            state.specialKey = null;
        } else {
            state.specialKey = specialKey;
        }

        updateSelection();
        dropdownMenu.classList.remove('show');
        dropdownToggle.classList.remove('open');
    }

    function handleConfirmClick() {
        if (state.mainKey === 'F5') {
            showToast('F5 can\'t be set as a hotkey — it\'s used for page refresh', 'error');
            return;
        }

        if (!state.mainKey && !state.specialKey) {
            showToast('You need to select a hotkey', 'error');
            return;
        }

        const parts = [];
        if (state.modifiers.has('Ctrl')) parts.push('CommandOrControl');
        if (state.modifiers.has('Alt')) parts.push('Alt');
        if (state.modifiers.has('Shift')) parts.push('Shift');
        if (state.mainKey) parts.push(state.mainKey);
        if (state.specialKey) parts.push(state.specialKey);

        window.api.selectHotkey(parts.join('+'));
    }

    // --- Initialization ---
    keyboardWrapper.addEventListener('click', handleKeyClick);
    document.querySelector('.confirm-button').addEventListener('click', handleConfirmClick);
    dropdownItems.forEach(item => item.addEventListener('click', handleDropdownItemClick));

    updateSelection(); // Set initial state

    // Load and apply initial theme
    const initialTheme = await window.api.getAppTheme();
    applyTheme(initialTheme);

    // Listen for theme changes from main process
    window.api.onUpdateTheme((theme) => {
        applyTheme(theme);
    });
});

