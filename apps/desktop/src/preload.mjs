import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld(
  "dolphinCloudDesktop",
  Object.freeze({
    getVersion: () => ipcRenderer.invoke("desktop:get-version"),
  }),
);
