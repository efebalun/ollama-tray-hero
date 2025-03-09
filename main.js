const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs');
const Store = require('electron-store');

// Initialize electron-store for persistent storage
const store = new Store({
  name: 'ollama-tray-hero-data',
  defaults: {
    conversationHistory: [],
    settings: {
      apiUrl: 'http://localhost:11434',
      selectedModel: 'llama3.2'
    }
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
const iconBase64 = `iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAjpJREFUWEfVl8FLVEEcxz+TK7Si4iHUg3jpHCRkENRBTCjRg5IQ1KGrG5HoIaQOewkTQzRJD3rwDxBEFJLsVoegwCCvQUQUdemQuMFKE7NvR99O7+2beftca25v3vx+38/vN7+Z934CY8gsKb6xiqDPfFfh8yZ7DIhlfvn9CP+DHGb9CIRN7hdinh49eQAgM/wE6iuM0tZ8V8zToBYXAOQwWwgu21onsk6yIRboF/IWJ6kjl4hTVyfN1AqZ4RlwxdU2kfUqCzKDTMRZTCf/IcCTPIyk4fd+acwnUjCbgzu1Trlwy4ASr0nB9CX48KpU6PRFGH3pgTlA2AOUE9coMSDsAKLEO67B9oqH4QgRDRAlrkRnct6WzBVvWAeI8gDlxNvOQvcYnL9ZWguTnfDprXUmwgHGt0GJBBWcmr+xCEpMZ+Dja5jpCi5MBaTXGmckHOCp9CIJMpz4Co2tcLv4LfPXgHkI772B9nOHaysCSDfBg/fQ1HboZuoCqOjDRmwAbai3oGsEBqdAXTjm+LIDD8/8Pa+L8fM7mOgIRCxfhHN5T9BfByoLj394ztbG4fmj4NgtT0L0MQyC6M3C1fvhN56luCKPBlCrTIj6U3B9AZaGwtNueSXbAQRBBCXeIXJtbg8QBRFD3H4L/NGq7bh7XJ/j8NMe+43bFsSWCTcUVWpGwgg2RaEV+07+CIKLdrlHWjcm1WjJTKBCi/ZvtGYarSotWrElO7iIzLwUW7XVxLslyQYtDIgsJf/zfwDBuAF1EsSNPAAAAABJRU5ErkJggg==`;

function createWindow() {
  const settings = getSettings();
  const alwaysOnTop = settings.alwaysOnTop === 'no' ? false : true;

  console.log(`Always on top setting: ${settings.alwaysOnTop}`);
  console.log(`Applying always on top: ${alwaysOnTop}`);

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

  // Remove the menu bar
  mainWindow.setMenu(null);

  mainWindow.loadFile('index.html');
  mainWindow.setAlwaysOnTop(alwaysOnTop, 'floating');

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
    height: 500, // Adjusted height to fit new content
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
    applyColorScheme(); // Apply color scheme when settings window is ready
  });

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
      label: 'Show/Hide (Win+Space)', 
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
  const colorScheme = settings.colorScheme || 'system';
  
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
  
  // Apply always on top setting
  const settings = getSettings();
  const alwaysOnTop = settings.alwaysOnTop === 'no' ? false : true;
  mainWindow.setAlwaysOnTop(alwaysOnTop, 'floating');
  
  // Register shortcut from settings
  const shortcut = settings.shortcut || 'Win+Space';
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
  return store.get('settings') || {
    apiUrl: 'http://localhost:11434',
    selectedModel: 'llama3.2'
  };
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
    const apiUrl = settings.apiUrl || 'http://localhost:11434';
    const model = settings.selectedModel || 'llama3.2';
    
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
    const apiUrl = settings.apiUrl || 'http://localhost:11434';
    
    const response = await fetch(`${apiUrl}/api/tags`);
    const data = await response.json();
    
    if (data && data.models) {
      // Sort models alphabetically
      const sortedModels = data.models.map(model => model.name).sort();
      
      // If we don't have a selected model yet, set the first available one as default
      if (sortedModels.length > 0 && (!settings.selectedModel || settings.selectedModel === 'llama3.2')) {
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