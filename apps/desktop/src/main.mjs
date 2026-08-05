import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  shell,
} from "electron";

import {
  createBrowserWindowOptions,
  createClassTerminalUrl,
  getDesktopIconPath,
  getWebRoot,
  isSafeExternalUrl,
  isTrustedAppNavigation,
} from "./desktopConfig.mjs";
import { startStaticServer } from "./staticServer.mjs";

const appPath = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const preloadPath = join(appPath, "src", "preload.mjs");

let desktopServer = null;
let isClosingServer = false;

app.enableSandbox();

function openExternalSafely(targetUrl) {
  if (isSafeExternalUrl(targetUrl)) {
    void shell.openExternal(targetUrl);
  }
}

function installNavigationGuards(webContents, trustedOrigin) {
  webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event, targetUrl) => {
    if (!isTrustedAppNavigation(targetUrl, trustedOrigin)) {
      event.preventDefault();
      openExternalSafely(targetUrl);
    }
  });
  webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
}

function createDesktopWindow() {
  if (desktopServer === null) {
    throw new Error("Desktop static server must start before the window.");
  }

  const browserWindow = new BrowserWindow(
    createBrowserWindowOptions({
      iconPath: getDesktopIconPath(app.getAppPath()),
      preloadPath,
    }),
  );
  installNavigationGuards(browserWindow.webContents, desktopServer.origin);
  browserWindow.once("ready-to-show", () => browserWindow.show());
  void browserWindow.loadURL(createClassTerminalUrl(desktopServer.origin));
}

app.on("web-contents-created", (_event, webContents) => {
  webContents.on("will-attach-webview", (event) => event.preventDefault());
});

app.on("before-quit", (event) => {
  if (desktopServer !== null && !isClosingServer) {
    event.preventDefault();
    isClosingServer = true;
    void desktopServer.close().finally(() => {
      desktopServer = null;
      app.quit();
    });
  }
});

app.on("window-all-closed", () => app.quit());

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && desktopServer !== null) {
    createDesktopWindow();
  }
});

await app.whenReady();

session.defaultSession.setPermissionCheckHandler(() => false);
session.defaultSession.setPermissionRequestHandler(
  (_webContents, _permission, callback) => callback(false),
);
ipcMain.handle("desktop:get-version", () => app.getVersion());

desktopServer = await startStaticServer({
  rootDirectory: getWebRoot({
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  }),
});
createDesktopWindow();
