import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const repositoryRoot = resolve(desktopRoot, "..", "..");
const desktopPackage = JSON.parse(
  readFileSync(join(desktopRoot, "package.json"), "utf8"),
);
const rootPackage = JSON.parse(
  readFileSync(join(repositoryRoot, "package.json"), "utf8"),
);
const windowsWorkflow = readFileSync(
  join(repositoryRoot, ".github", "workflows", "desktop-windows.yml"),
  "utf8",
);

describe("Windows desktop build configuration", () => {
  it("packages one x64 portable EXE with the fixed identity and icon", () => {
    expect(desktopPackage.build).toMatchObject({
      appId: "cn.hy916.dolphincloud.classterminal",
      artifactName: "DolphinCloud-ClassTerminal-${version}-${arch}.${ext}",
      productName: "海豚云班级端",
      win: {
        executableName: "DolphinCloud-ClassTerminal",
        icon: "assets/app-icon.png",
        target: [{ arch: ["x64"], target: "portable" }],
      },
    });
    expect(desktopPackage.build.extraResources).toContainEqual({
      filter: ["**/*"],
      from: "../client/dist/web",
      to: "web",
    });
  });

  it("exposes cross-platform root commands", () => {
    expect(rootPackage.scripts).toMatchObject({
      "desktop:build:web": "pnpm smoke:web",
      "desktop:dist:win":
        "pnpm desktop:build:web && pnpm --filter @dolphincloud/desktop dist:win",
      "desktop:test": "vitest run apps/desktop/src/__tests__",
      "desktop:verify:win":
        "node scripts/desktop/verify-windows-artifact.mjs",
    });
  });

  it("builds and verifies the EXE on a Windows GitHub runner", () => {
    expect(windowsWorkflow).toContain("runs-on: windows-latest");
    expect(windowsWorkflow).toContain("run: pnpm desktop:test");
    expect(windowsWorkflow).toContain("run: pnpm desktop:dist:win");
    expect(windowsWorkflow).toContain("run: pnpm desktop:verify:win");
    expect(windowsWorkflow).toContain("name: dolphincloud-class-terminal-");
    expect(windowsWorkflow).toContain("path: artifacts/desktop");
  });
});
