const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  nativeTheme
} = require('electron');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs');
const Store = require('electron-store');

// Constants
const defaultSettings = {
  apiUrl: 'http://localhost:11434',
  selectedModel: 'llama3.2',
  colorScheme: 'system',
  runOnStartup: 'yes',
  alwaysOnTop: 'yes',
  shortcut: 'Shift+Space'
};

// Initialize electron-store for persistent storage
const store = new Store({
  firstRun: true,
  name: 'ollama-tray-hero-data',
  defaults: {
    conversationHistory: [],
    settings: defaultSettings,
  }
});

// Enable hot reload for development
try {
  require('electron-reloader')(module, {
    ignore: ['node_modules', 'package.json']
  });
  console.log('Hot reload enabled');
} catch (err) {
  console.error('Error setting up hot reload:', err);
}

let mainWindow = null;
let settingsWindow = null;
let tray = null;

// Create a simple base64 icon for the tray
const iconBase64 = `iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAEoSURBVHgBnZMvT8NAGMZ/d8GAImARNfPgcGxIFIR5hgPMyjcYn4DhQAEfgGQTYFuJ448EUxIsUDe3470eDenabpc9yaXttb+nz3vvnUJkjghQXMtYl8dlZskwkHGqLklUBmuevMCiUsZsaIHP54DJGEmt5WbX6/N2vzwnJWt81GhCq+uuEynqDTY7sCiV7cufw8jN2etEkoV6gwMY/cBdCK8DB/db8B57GKwELu4ohZehg6KLEmylzIl0NNeabIPGFuz0YOmvMY83Mm7hK4HvpGRQTNCWjq4G/3BWSscZP5xVGhQT5LILt911wNUefD5Tp+ou2IWz9d/3psK5QVr55i2Wuj+YJWWOiWRHNZlHY4ZaVuCwNsV0WSbU9kjaU5UdUV/QEFvGsr/3WFmf+l4G5gAAAABJRU5ErkJggg==`;

function createWindow() {
  const firstRun = store.get('firstRun', true);

  const settings = getSettings();
  const alwaysOnTop = settings.alwaysOnTop === 'yes' ? true : false;

  mainWindow = new BrowserWindow({
    width: 600,
    height: 600,
    frame: true,
    alwaysOnTop: alwaysOnTop,
    show: false, // Start hidden
    icon: path.join(__dirname, 'assets/icon.ico'), // Add application icon
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setMenu(null);
  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    if (firstRun) {
      mainWindow.webContents.send('first-run');
      mainWindow.show();
      store.set('firstRun', false);
    }
    applyColorScheme();
  });

  // Open the DevTools only in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Hide window instead of closing when the X button is clicked
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
    return true;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 500,
    resizable: true,
    minimizable: false,
    maximizable: false,
    parent: mainWindow,
    modal: true,
    show: false,
    icon: path.join(__dirname, 'assets/icon.ico'), // Add application icon
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  settingsWindow.setMenu(null);
  settingsWindow.loadFile('settings.html');

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
    applyColorScheme();
  });

  // Open the DevTools only in development mode
  if (process.env.NODE_ENV === 'development') {
    settingsWindow.webContents.openDevTools();
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createTray() {
  // Create a tray icon from base64
  const iconBuffer = Buffer.from(iconBase64, 'base64');
  const icon = nativeImage.createFromBuffer(iconBuffer);
  
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Show/Hide', 
      click: () => {
        toggleWindow();
      }
    },
    { 
      label: 'Settings', 
      click: () => {
        createSettingsWindow();
      }
    },
    { type: 'separator' },
    { 
      label: 'Exit', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Ollama Tray Hero');
  tray.setContextMenu(contextMenu);
  
  // Double click on tray icon to toggle window
  tray.on('double-click', toggleWindow);
}

function toggleWindow() {
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function applyColorScheme() {
  const settings = getSettings();
  const systemColorScheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  const settingsColorScheme = settings.colorScheme;

  let colorScheme = settingsColorScheme || systemColorScheme;
  if (colorScheme === 'system') {
    colorScheme = systemColorScheme;
  }

  console.log(`System color scheme: ${systemColorScheme}`);
  console.log(`Settings color scheme: ${settings.colorScheme}`);
  console.log(`Applying color scheme: ${colorScheme}`);

  mainWindow.webContents.executeJavaScript(`
    document.documentElement.setAttribute('data-color-scheme', '${colorScheme}');
  `);
  
  if (settingsWindow && settingsWindow.webContents) {
    settingsWindow.webContents.executeJavaScript(`
      document.documentElement.setAttribute('data-color-scheme', '${colorScheme}');
    `);
  }
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  applyColorScheme();

  // Get settings
  const settings = getSettings();
  const runOnStartup = settings.runOnStartup === 'yes';
  const alwaysOnTop = settings.alwaysOnTop === 'yes';
  
  // Set app to run on startup
  app.setLoginItemSettings({ openAtLogin: runOnStartup });

  // Apply always on top setting
  mainWindow.setAlwaysOnTop(alwaysOnTop, 'floating');
  
  // Register shortcut from settings
  const shortcut = settings.shortcut || 'Shift+Space';
  const ret = globalShortcut.register(shortcut, toggleWindow);
  if (ret) {
    console.log(`Shortcut ${shortcut} registered successfully`);
  } else {
    console.log(`Failed to register shortcut: ${shortcut}`);
    // Fallback shortcut
    globalShortcut.register('CommandOrControl+Alt+O', toggleWindow);
    console.log('Registered fallback shortcut: Ctrl+Alt+O');
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts when app is about to quit
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

// Load conversation history from storage
let conversationHistory = store.get('conversationHistory') || [];

// Get settings from store
function getSettings() {
  return store.get('settings') || defaultSettings;
}

// Handle Ollama API calls
ipcMain.handle('chat-message', async (event, message) => {
  try {
    // Add user message to history
    conversationHistory.push({ role: 'user', content: message });
    
    // Persist to storage
    store.set('conversationHistory', conversationHistory);
    
    // Get current settings
    const settings = getSettings();
    const apiUrl = settings.apiUrl || defaultSettings.apiUrl;
    const model = settings.selectedModel || defaultSettings.selectedModel;
    
    // Debug log to see which model is being used
    console.log(`Using model: ${model} for chat request`);
    
    const response = await fetch(`${apiUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: conversationHistory
      })
    });

    const text = await response.text();
    console.log('Text received');

    try {
      // Ollama returns multiple JSON objects separated by newlines
      const lines = text.split('\n').filter(line => line.trim());
      let fullResponse = '';
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.message && data.message.content) {
            fullResponse += data.message.content;
          }
        } catch (parseError) {
          console.error('Parse error for line:', line);
        }
      }
      
      if (fullResponse) {
        // Add assistant response to history
        conversationHistory.push({ role: 'assistant', content: fullResponse });
        
        // Keep conversation history to a reasonable size
        if (conversationHistory.length > 50) {
          conversationHistory = conversationHistory.slice(-50);
        }
        
        // Persist updated history to storage
        store.set('conversationHistory', conversationHistory);
        
        return fullResponse;
      }
      
      return 'No response received';
    } catch (parseError) {
      console.error('Parse error:', parseError);
      return 'Error parsing response from Ollama';
    }
  } catch (error) {
    console.error('Error:', error);
    return 'Error connecting to Ollama. Make sure it\'s running.';
  }
});

// Settings handlers
ipcMain.handle('get-settings', () => {
  return getSettings();
});

ipcMain.handle('save-setting', (event, key, value) => {
  const settings = getSettings();
  settings[key] = value;
  store.set('settings', settings);
  
  // Apply color scheme if changed
  if (key === 'colorScheme') {
    applyColorScheme();
  }

  // Apply run on startup if changed
  if (key === 'runOnStartup') {
    const runOnStartup = value === 'yes';
    app.setLoginItemSettings({ openAtLogin: runOnStartup });
  }

  // Apply always on top if changed
  if (key === 'alwaysOnTop') {
    const alwaysOnTop = value === 'yes';
    mainWindow.setAlwaysOnTop(alwaysOnTop, 'floating');
  }
  
  // Apply shortcut if changed
  if (key === 'shortcut') {
    globalShortcut.unregisterAll();
    const ret = globalShortcut.register(value, toggleWindow);
    if (ret) {
      console.log(`Shortcut ${value} registered successfully`);
    } else {
      console.log(`Failed to register shortcut: ${value}`);
      // Fallback shortcut
      globalShortcut.register('CommandOrControl+Alt+O', toggleWindow);
      console.log('Registered fallback shortcut: Ctrl+Alt+O');
    }
  }
  
  // Notify about settings change
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('settings-changed');
  }
  
  return true;
});

ipcMain.handle('open-settings', () => {
  createSettingsWindow();
  return true;
});

ipcMain.handle('get-available-models', async () => {
  try {
    const settings = getSettings();
    const apiUrl = settings.apiUrl || defaultSettings.apiUrl;
    
    const response = await fetch(`${apiUrl}/api/tags`);
    const data = await response.json();
    
    if (data && data.models) {
      // Sort models alphabetically
      const sortedModels = data.models.map(model => model.name).sort();
      
      // If we don't have a selected model yet, set the first available one as default
      if (sortedModels.length > 0 && (!settings.selectedModel || settings.selectedModel === defaultSettings.selectedModel)) {
        const currentSettings = getSettings();
        currentSettings.selectedModel = sortedModels[0];
        store.set('settings', currentSettings);
      }
      
      return sortedModels;
    }
    return [];
  } catch (error) {
    console.error('Error fetching models:', error);
    return [];
  }
});

// Clear conversation history
ipcMain.handle('clear-history', () => {
  conversationHistory = [];
  store.set('conversationHistory', []);
  // Notify main window that history was cleared
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('history-cleared');
  }
  return true;
});

// Get stored conversation history
ipcMain.handle('get-history', () => {
  return conversationHistory;
});

// Close settings window
ipcMain.on('close-settings', () => {
  if (settingsWindow) {
    settingsWindow.close();
  }
});