import { appendFileSync } from "node:fs";
import { join } from "node:path";

import { verifyWindowsArtifact } from "./windowsArtifact.mjs";

const result = verifyWindowsArtifact({
  artifactDirectory: join(process.cwd(), "artifacts", "desktop"),
  outputDirectory: join(
    process.cwd(),
    "apps",
    "desktop",
    "dist",
    "windows",
  ),
});

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `artifact_name=${result.artifactName}\nsha256=${result.digest}\n`,
    "utf8",
  );
}

console.log(`Verified ${result.artifactPath} (${result.executableSize} bytes)`);
console.log(`SHA-256 ${result.digest}`);
