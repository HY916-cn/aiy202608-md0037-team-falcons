import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolvePnpmInvocation, runPnpmSync } from "../pnpm-command.mjs";
import { createZipFromDirectory } from "../zip-directory.mjs";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createTemporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "dolphin-release-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function readStoredEntries(archive) {
  const entries = new Map();
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const method = archive.readUInt16LE(offset + 8);
    const contentLength = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameLength + extraLength;
    const name = archive.subarray(nameStart, nameStart + nameLength).toString("utf8");
    expect(method).toBe(0);
    entries.set(name, archive.subarray(contentStart, contentStart + contentLength));
    offset = contentStart + contentLength;
  }
  expect(archive.readUInt32LE(offset)).toBe(0x02014b50);
  return entries;
}

describe("release tooling", () => {
  it("runs pnpm through the current Node executable on Windows npm scripts", () => {
    expect(
      resolvePnpmInvocation({
        environment: { npm_execpath: "C:\\pnpm\\pnpm.cjs" },
        nodeExecutable: "C:\\Program Files\\nodejs\\node.exe",
        platform: "win32",
      }),
    ).toEqual({
      command: "C:\\Program Files\\nodejs\\node.exe",
      prefixArguments: ["C:\\pnpm\\pnpm.cjs"],
    });
  });

  it("falls back to cmd and pnpm.cmd on Windows", () => {
    expect(
      resolvePnpmInvocation({
        environment: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
        platform: "win32",
      }),
    ).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      prefixArguments: ["/d", "/s", "/c", "pnpm.cmd"],
    });
  });

  it.runIf(process.platform === "win32")(
    "executes pnpm through the Windows fallback without ENOENT",
    () => {
      const result = runPnpmSync(["--version"], {
        environment: { ...process.env, npm_execpath: "" },
        stdio: "pipe",
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout.toString("utf8")).toMatch(/^11\./u);
    },
  );

  it("creates a deterministic ZIP without a system zip executable", () => {
    const root = createTemporaryDirectory();
    const source = join(root, "source");
    const firstArchive = join(root, "first.zip");
    const secondArchive = join(root, "second.zip");
    mkdirSync(join(source, "assets"), { recursive: true });
    writeFileSync(join(source, "index.html"), "<h1>Dolphin Cloud</h1>", "utf8");
    writeFileSync(join(source, "assets", "应用.txt"), "synthetic demo", "utf8");

    expect(createZipFromDirectory(source, firstArchive)).toEqual([
      "assets/应用.txt",
      "index.html",
    ]);
    createZipFromDirectory(source, secondArchive);

    const first = readFileSync(firstArchive);
    expect(first.equals(readFileSync(secondArchive))).toBe(true);
    const entries = readStoredEntries(first);
    expect(entries.get("index.html")?.toString("utf8")).toBe(
      "<h1>Dolphin Cloud</h1>",
    );
    expect(entries.get("assets/应用.txt")?.toString("utf8")).toBe(
      "synthetic demo",
    );
  });
});
