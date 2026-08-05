import { spawnSync } from "node:child_process";

const includeDatabase = process.argv.includes("--database");
const steps = [
  ["Dependency alignment", ["verify:deps"]],
  ["Formatting", ["format:check"]],
  ["Lint", ["lint"]],
  ["TypeScript", ["typecheck"]],
  ["Unit tests", ["test"]],
  ["Web export", ["smoke:web"]],
  ["Android export", ["smoke:android"]],
];

if (includeDatabase) {
  steps.splice(5, 0, ["Database and RLS", ["database:test"]]);
}

for (const [label, args] of steps) {
  console.log(`\n[RC] ${label}`);
  const result = spawnSync("pnpm", args, {
    cwd: process.cwd(),
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`[RC] FAILED: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n[RC] PASS: all requested preflight checks completed.");
