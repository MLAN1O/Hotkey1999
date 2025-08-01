document.addEventListener('DOMContentLoaded', () => {
    const state = { modifiers: new Set(), mainKey: null };
    const keyboardContainer = document.getElementById('keyboard-container');

    const keyLayout = [
        ['Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
        ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
        ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
        ['CapsLock', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter'],
        ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/'],
        ['Ctrl', 'Alt', 'Space', 'Alt', 'Ctrl'],
        { type: 'block', keys: [
            ['Insert', 'Home', 'PageUp'],
            ['Delete', 'End', 'PageDown'],
            ['PrintScreen', 'ScrollLock', 'Pause']
        ]},
        { type: 'block', keys: [
            ['Up'],
            ['Left', 'Down', 'Right']
        ]},
        ['Confirm']
    ];

    function updateSelection() {
        document.querySelectorAll('.key').forEach(keyEl => {
            const key = keyEl.dataset.key;
            keyEl.classList.toggle('selected', state.modifiers.has(key) || state.mainKey === key);
        });
    }

    function handleKeyClick(key) {
        if (key === 'Confirm') {
            if (!state.mainKey) {
                alert('Error: You must select a main key (like A, F1, etc.) in addition to modifiers.');
                return;
            }
            const parts = [];
            if (state.modifiers.has('Ctrl')) parts.push('CommandOrControl');
            if (state.modifiers.has('Alt')) parts.push('Alt');
            if (state.modifiers.has('Shift')) parts.push('Shift');
            if (state.mainKey) parts.push(state.mainKey);
            
            window.api.selectHotkey(parts.join('+'));
            return;
        }
        const isModifier = ['Ctrl', 'Alt', 'Shift'].includes(key);
        if (isModifier) {
            state.modifiers.has(key) ? state.modifiers.delete(key) : state.modifiers.add(key);
        } else {
            state.mainKey = state.mainKey === key ? null : key;
        }
        updateSelection();
    }

    function createKeyElement(key) {
        const keyEl = document.createElement('div');
        keyEl.className = 'key';
        keyEl.textContent = key;
        keyEl.dataset.key = key;
        if (['Ctrl', 'Alt', 'Shift'].includes(key)) keyEl.classList.add('modifier');
        if (key === 'Confirm') keyEl.classList.add('confirm-btn');
        const specialSizeKeys = ['Backspace', 'Tab', 'CapsLock', 'Enter', 'Shift', 'Space'];
        if (specialSizeKeys.includes(key)) {
            keyEl.classList.add(`key-${key.toLowerCase()}`);
        }
        keyEl.addEventListener('click', () => handleKeyClick(key));
        return keyEl;
    }

    keyLayout.forEach(row => {
        if (row.type === 'block') {
            const blockContainer = document.createElement('div');
            blockContainer.className = 'key-row';
            row.keys.forEach(subRow => {
                const subRowEl = document.createElement('div');
                subRowEl.className = 'key-block';
                subRow.forEach(key => subRowEl.appendChild(createKeyElement(key)));
                blockContainer.appendChild(subRowEl);
            });
            keyboardContainer.appendChild(blockContainer);
        } else {
            const rowEl = document.createElement('div');
            rowEl.className = 'key-row';
            row.forEach(key => rowEl.appendChild(createKeyElement(key)));
            keyboardContainer.appendChild(rowEl);
        }
    });
});
