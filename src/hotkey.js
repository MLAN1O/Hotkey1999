document.addEventListener('DOMContentLoaded', () => {
    const state = { modifiers: new Set(), mainKey: null };
    const keyboardWrapper = document.querySelector('.keyboard-wrapper');

    // --- State Initialization ---
    const params = new URLSearchParams(window.location.search);
    const currentHotkey = params.get('hotkey');
    if (currentHotkey) {
        const parts = currentHotkey.split('+');
        parts.forEach(part => {
            const normalizedPart = part.replace('CommandOrControl', 'Ctrl').replace('CmdOrCtrl', 'Ctrl');
            if (['Ctrl', 'Alt', 'Shift'].includes(normalizedPart)) {
                state.modifiers.add(normalizedPart);
            } else {
                state.mainKey = normalizedPart;
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
            // Allow only one main key to be selected
            state.mainKey = state.mainKey === key ? null : key;
        }
        updateSelection();
    }

    function handleConfirmClick() {
        if (state.mainKey === 'F5') {
            showToast('F5 can\'t be set as a hotkey — it\'s used for page refresh', 'error');
            return;
        }

        if (!state.mainKey) {
            showToast('You need to select a hotkey', 'error');
            return;
        }

        const parts = [];
        if (state.modifiers.has('Ctrl')) parts.push('CommandOrControl');
        if (state.modifiers.has('Alt')) parts.push('Alt');
        if (state.modifiers.has('Shift')) parts.push('Shift');
        parts.push(state.mainKey);

        window.api.selectHotkey(parts.join('+'));
    }

    // --- Initialization ---
    keyboardWrapper.addEventListener('click', handleKeyClick);
    document.querySelector('.confirm-button').addEventListener('click', handleConfirmClick);

    updateSelection(); // Set initial state
});

