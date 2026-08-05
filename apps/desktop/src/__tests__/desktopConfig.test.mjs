import { describe, expect, it } from "vitest";

import {
  DEFAULT_CLASS_TERMINAL_PATH,
  DESKTOP_APP_ID,
  DESKTOP_PRODUCT_NAME,
  createBrowserWindowOptions,
  createClassTerminalUrl,
  getWebRoot,
  isSafeExternalUrl,
  isTrustedAppNavigation,
} from "../desktopConfig.mjs";

describe("desktop configuration", () => {
  it("uses the fixed DolphinCloud identity and class terminal route", () => {
    expect(DESKTOP_APP_ID).toBe("cn.hy916.dolphincloud.classterminal");
    expect(DESKTOP_PRODUCT_NAME).toBe("海豚云班级端");
    expect(DEFAULT_CLASS_TERMINAL_PATH).toBe("/(class-terminal)/");
    expect(createClassTerminalUrl("http://127.0.0.1:43210")).toBe(
      "http://127.0.0.1:43210/(class-terminal)/",
    );
  });

  it("locks down the renderer process", () => {
    const options = createBrowserWindowOptions({
      iconPath: "/app/assets/app-icon.png",
      preloadPath: "/app/src/preload.mjs",
    });

    expect(options.title).toBe("海豚云班级端");
    expect(options.icon).toBe("/app/assets/app-icon.png");
    expect(options.webPreferences).toMatchObject({
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: "/app/src/preload.mjs",
      sandbox: true,
      webSecurity: true,
    });
  });

  it("trusts only the exact loopback application origin", () => {
    const origin = "http://127.0.0.1:43210";
    expect(isTrustedAppNavigation(`${origin}/(class-terminal)/`, origin)).toBe(
      true,
    );
    expect(isTrustedAppNavigation("http://127.0.0.1:43211/", origin)).toBe(
      false,
    );
    expect(isTrustedAppNavigation("http://localhost:43210/", origin)).toBe(
      false,
    );
    expect(isTrustedAppNavigation("https://example.com/", origin)).toBe(false);
  });

  it("allows only HTTPS URLs to leave through the system browser", () => {
    expect(isSafeExternalUrl("https://example.com/docs")).toBe(true);
    expect(isSafeExternalUrl("http://example.com/")).toBe(false);
    expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("not a URL")).toBe(false);
  });

  it("resolves development and packaged Web roots without remote URLs", () => {
    expect(
      getWebRoot({
        appPath: "/repo/apps/desktop",
        isPackaged: false,
        resourcesPath: "/resources",
      }),
    ).toBe("/repo/apps/client/dist/web");
    expect(
      getWebRoot({
        appPath: "/resources/app.asar",
        isPackaged: true,
        resourcesPath: "/resources",
      }),
    ).toBe("/resources/web");
  });
});
