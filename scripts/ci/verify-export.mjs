import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
  requireFile(join(webDist, "manifest.webmanifest"));
  requireFile(join(webDist, "pwa-icon-512.png"));
  requireFile(join(webDist, "apple-touch-icon.png"));
  requireFile(join(webDist, "favicon-32.png"));
  requireFile(join(webDist, "favicon-16.png"));
  [
    "pwa-icon-512.png",
    "apple-touch-icon.png",
    "favicon-32.png",
    "favicon-16.png",
  ].forEach((icon) => {
    const exported = readFileSync(join(webDist, icon));
    const source = readFileSync(join(process.cwd(), "apps", "client", "assets", icon));
    if (!exported.equals(source)) {
      throw new Error(`Exported Web icon does not match the product asset: ${icon}`);
    }
  });
  roleRoutes.forEach((role) =>
    requireFile(join(webDist, `(${role})`, "index.html")),
  );

  const bundles = walk(join(webDist, "_expo", "static", "js", "web"));
  if (!bundles.some((file) => file.endsWith(".js") && statSync(file).size > 0)) {
    throw new Error("Web export does not contain a JavaScript bundle.");
  }
  const bundleSource = bundles
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const forbiddenRuntimeMarkers = [
    "EXPO_PUBLIC_MOCK_ROLE",
    "MockAiExperienceAdapter",
    "MockAuthSessionAdapter",
    "MockGovernanceService",
    "MockGradeReportSheetService",
    "MockTeachingDemoAdapter",
  ];
  forbiddenRuntimeMarkers.forEach((marker) => {
    if (bundleSource.includes(marker)) {
      throw new Error(`Production Web bundle contains test-only runtime marker: ${marker}`);
    }
  });
  console.log("Web smoke passed: routes, production icons, manifest and Mock-free bundle exist.");
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
