import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);
const { verifyWindowsArtifact } = await import(
  pathToFileURL(
    join(repositoryRoot, "scripts", "desktop", "windowsArtifact.mjs"),
  ).href
);

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createTemporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "dolphin-exe-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("Windows artifact verification", () => {
  it("copies one non-empty portable EXE and writes its SHA-256", () => {
    const root = createTemporaryDirectory();
    const outputDirectory = join(root, "output");
    const artifactDirectory = join(root, "artifacts");
    mkdirSync(outputDirectory, { recursive: true });
    const executable = Buffer.alloc(1_000_001, 0x44);
    writeFileSync(
      join(outputDirectory, "DolphinCloud-ClassTerminal-0.1.0-x64.exe"),
      executable,
    );

    const result = verifyWindowsArtifact({
      artifactDirectory,
      outputDirectory,
    });
    const expectedDigest = createHash("sha256").update(executable).digest("hex");
    expect(result.digest).toBe(expectedDigest);
    expect(readFileSync(result.artifactPath).equals(executable)).toBe(true);
    expect(
      readFileSync(join(artifactDirectory, "checksums-windows.txt"), "utf8"),
    ).toBe(`${expectedDigest}  ${result.artifactName}\n`);
  });

  it("rejects missing, duplicate and implausibly small executables", () => {
    const root = createTemporaryDirectory();
    const outputDirectory = join(root, "output");
    const artifactDirectory = join(root, "artifacts");
    mkdirSync(outputDirectory, { recursive: true });

    expect(() =>
      verifyWindowsArtifact({ artifactDirectory, outputDirectory }),
    ).toThrow("Expected exactly one portable EXE, found 0.");

    writeFileSync(join(outputDirectory, "first.exe"), "not-an-exe", "utf8");
    expect(() =>
      verifyWindowsArtifact({ artifactDirectory, outputDirectory }),
    ).toThrow("Portable EXE is unexpectedly small");

    writeFileSync(join(outputDirectory, "second.exe"), "not-an-exe", "utf8");
    expect(() =>
      verifyWindowsArtifact({ artifactDirectory, outputDirectory }),
    ).toThrow("Expected exactly one portable EXE, found 2.");
  });
});
