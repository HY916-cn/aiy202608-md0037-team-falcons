import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

import { runPnpmSync } from "./pnpm-command.mjs";
import { createZipFromDirectory } from "./zip-directory.mjs";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const fullSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const shortSha = fullSha.slice(0, 8);
const status = execFileSync("git", ["status", "--porcelain"], {
  cwd: root,
  encoding: "utf8",
}).trim();

if (status !== "") {
  throw new Error("Refusing to package a dirty worktree. Commit the RC files first.");
}

const smokeResult = runPnpmSync(["smoke:web"], { cwd: root });
if (smokeResult.error) {
  throw smokeResult.error;
}
if (smokeResult.status !== 0) {
  throw new Error(`Web smoke failed with exit code ${smokeResult.status ?? 1}.`);
}

const exportDirectory = join(root, "apps", "client", "dist", "web");
if (!existsSync(join(exportDirectory, "index.html"))) {
  throw new Error("The verified Web export is missing index.html.");
}

const artifactDirectory = join(root, "artifacts", "release");
mkdirSync(artifactDirectory, { recursive: true });

const artifactName = `dolphincloud-web-v${packageJson.version}-${shortSha}.zip`;
const artifactPath = join(artifactDirectory, artifactName);
rmSync(artifactPath, { force: true });
createZipFromDirectory(exportDirectory, artifactPath);

const digest = createHash("sha256")
  .update(readFileSync(artifactPath))
  .digest("hex");
const checksumPath = join(artifactDirectory, "checksums-v0.1.0.txt");
writeFileSync(checksumPath, `${digest}  ${basename(artifactPath)}\n`, "utf8");

console.log(`Created ${artifactPath}`);
console.log(`SHA-256 ${digest}`);
