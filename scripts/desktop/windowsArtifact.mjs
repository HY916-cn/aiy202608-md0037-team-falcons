import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

export function listPortableExecutables(outputDirectory) {
  return readdirSync(outputDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".exe"))
    .map((entry) => join(outputDirectory, entry.name))
    .sort();
}

export function verifyWindowsArtifact({ artifactDirectory, outputDirectory }) {
  const executables = listPortableExecutables(outputDirectory);
  if (executables.length !== 1) {
    throw new Error(
      `Expected exactly one portable EXE, found ${executables.length}.`,
    );
  }

  const executablePath = executables[0];
  const executableSize = statSync(executablePath).size;
  if (executableSize < 1_000_000) {
    throw new Error(`Portable EXE is unexpectedly small: ${executableSize} bytes.`);
  }

  mkdirSync(artifactDirectory, { recursive: true });
  const artifactName = basename(executablePath);
  const artifactPath = join(artifactDirectory, artifactName);
  copyFileSync(executablePath, artifactPath);
  const digest = createHash("sha256")
    .update(readFileSync(artifactPath))
    .digest("hex");
  writeFileSync(
    join(artifactDirectory, "checksums-windows.txt"),
    `${digest}  ${artifactName}\n`,
    "utf8",
  );

  return { artifactName, artifactPath, digest, executableSize };
}
