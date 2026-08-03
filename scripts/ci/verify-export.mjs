import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const platform = process.argv[2];
const clientDist = join(process.cwd(), "apps", "client", "dist");

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function requireFile(path) {
  if (!existsSync(path) || statSync(path).size === 0) {
    throw new Error(`Missing or empty export file: ${path}`);
  }
}

if (platform === "web") {
  const webDist = join(clientDist, "web");
  const roleRoutes = [
    "admin",
    "bank-operator",
    "class-terminal",
    "council",
    "family",
    "teacher",
  ];

  requireFile(join(webDist, "index.html"));
  requireFile(join(webDist, "_expo", ".routes.json"));
  roleRoutes.forEach((role) =>
    requireFile(join(webDist, `(${role})`, "index.html")),
  );

  const bundles = walk(join(webDist, "_expo", "static", "js", "web"));
  if (!bundles.some((file) => file.endsWith(".js") && statSync(file).size > 0)) {
    throw new Error("Web export does not contain a JavaScript bundle.");
  }
  console.log("Web smoke passed: root, six role routes, route manifest and bundle exist.");
} else if (platform === "android") {
  const androidDist = join(clientDist, "android");
  if (!existsSync(androidDist)) {
    throw new Error(`Missing Android export directory: ${androidDist}`);
  }

  const files = walk(androidDist);
  const hasBundle = files.some(
    (file) => /\.(hbc|js)$/.test(file) && statSync(file).size > 0,
  );
  if (!hasBundle) {
    throw new Error("Android export does not contain a non-empty Hermes or JS bundle.");
  }
  console.log("Android smoke passed: a non-empty application bundle exists.");
} else {
  throw new Error("Usage: node scripts/ci/verify-export.mjs <web|android>");
}
