import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const checkedExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
).split("\0");

const failures = [];

for (const file of files) {
  const extension = file.slice(file.lastIndexOf("."));
  if (!file || !checkedExtensions.has(extension)) {
    continue;
  }

  const content = readFileSync(file, "utf8");
  if (content.includes("\r")) {
    failures.push(`${file}: contains CRLF line endings`);
  }
  if (content.length > 0 && !content.endsWith("\n")) {
    failures.push(`${file}: missing final newline`);
  }

  content.split("\n").forEach((line, index) => {
    if (/[\t ]+$/.test(line)) {
      failures.push(`${file}:${index + 1}: trailing whitespace`);
    }
  });
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Formatting baseline passed for ${files.length - 1} tracked files.`);
