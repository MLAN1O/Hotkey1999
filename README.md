# HotkeyMyURLLikeIts1999

This app opens a URL in a clean, fullscreen window using a global hotkey.

## The Difference

Unlike a browser shortcut, this app runs silently in the background from startup. It keeps your page pre-loaded in memory.

When you press the hotkey, the window appears **instantly**. There is no browser launch, no page load, and no delay. It feels like a native OS feature. Press the hotkey again to hide it instantly.

## How to Use

### Option 1: Use the Release (Recommended)

1. Go to the [Releases page](https://github.com/MLAN1O/Hotkey1999/releases) of this repository.  
2. Download and run the latest installer (`.exe`).

### Option 2: Build from Source

1.  **Run for development:**
    ```bash
    git clone https://github.com/MLAN1O/Hotkey1999.git
    cd Hotkey1999
    npm install
    npm start
    ```

2.  **Build your own executable:**
    ```bash
    npm run dist
    ```
    This will create an installer in the `dist` folder.

## Configuration

After running the app, right-click its icon in your system tray to set the URL and hotkey.

---
By Max L. Mendes
