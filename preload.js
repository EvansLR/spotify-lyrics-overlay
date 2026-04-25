const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlayApi", {
  startAuth: (clientId) => ipcRenderer.invoke("auth:start", clientId),
  disconnect: () => ipcRenderer.invoke("auth:disconnect"),
  authStatus: () => ipcRenderer.invoke("auth:status"),
  getPlayer: () => ipcRenderer.invoke("spotify:player"),
  getLyrics: (track) => ipcRenderer.invoke("lyrics:get", track),
  setClickThrough: (enabled) => ipcRenderer.invoke("window:set-click-through", enabled),
  quit: () => ipcRenderer.invoke("window:quit"),
  onAuthSuccess: (callback) => ipcRenderer.on("auth:success", callback),
  onAuthError: (callback) => ipcRenderer.on("auth:error", (_event, message) => callback(message)),
  onToggleLock: (callback) => ipcRenderer.on("lock:toggle", callback),
  onSetLock: (callback) => ipcRenderer.on("lock:set", (_event, locked) => callback(locked)),
});
