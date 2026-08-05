import { join } from "node:path";

export const DEFAULT_CLASS_TERMINAL_PATH = "/(class-terminal)/";
export const DESKTOP_APP_ID = "cn.hy916.dolphincloud.classterminal";
export const DESKTOP_PRODUCT_NAME = "海豚云班级端";

export function createBrowserWindowOptions({ iconPath, preloadPath }) {
  return {
    backgroundColor: "#FFFFFF",
    height: 800,
    icon: iconPath,
    minHeight: 640,
    minWidth: 960,
    show: false,
    title: DESKTOP_PRODUCT_NAME,
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
    },
    width: 1280,
  };
}

export function createClassTerminalUrl(origin) {
  return new URL(DEFAULT_CLASS_TERMINAL_PATH, `${origin}/`).href;
}

export function getDesktopIconPath(appPath) {
  return join(appPath, "assets", "app-icon.png");
}

export function getWebRoot({ appPath, isPackaged, resourcesPath }) {
  return isPackaged
    ? join(resourcesPath, "web")
    : join(appPath, "..", "client", "dist", "web");
}

export function isSafeExternalUrl(targetUrl) {
  try {
    return new URL(targetUrl).protocol === "https:";
  } catch {
    return false;
  }
}

export function isTrustedAppNavigation(targetUrl, trustedOrigin) {
  try {
    const parsedTarget = new URL(targetUrl);
    return (
      parsedTarget.protocol === "http:" &&
      parsedTarget.hostname === "127.0.0.1" &&
      parsedTarget.origin === new URL(trustedOrigin).origin
    );
  } catch {
    return false;
  }
}
