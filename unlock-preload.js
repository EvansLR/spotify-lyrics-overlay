const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("unlockApi", {
  unlock: () => ipcRenderer.invoke("lock-button:unlock"),
});
