const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Chat functions
  sendMessage: (message) => ipcRenderer.invoke('chat-message', message),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  onHistoryCleared: (callback) => ipcRenderer.on('history-cleared', callback),
  
  // Settings functions
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSetting: (key, value) => ipcRenderer.invoke('save-setting', key, value),
  getAvailableModels: () => ipcRenderer.invoke('get-available-models'),
  closeSettings: () => ipcRenderer.send('close-settings'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  onSettingsChanged: (callback) => ipcRenderer.on('settings-changed', callback)
});