import { runPnpmSync } from "./pnpm-command.mjs";

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
  const result = runPnpmSync(args, { cwd: process.cwd() });
  if (result.error) {
    console.error(`[RC] FAILED: ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[RC] FAILED: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n[RC] PASS: all requested preflight checks completed.");
