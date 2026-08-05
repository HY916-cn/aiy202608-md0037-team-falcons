import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  LOOPBACK_HOST,
  resolveStaticCandidates,
  startStaticServer,
} from "../staticServer.mjs";

const temporaryDirectories = [];
const runningServers = [];

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((server) => server.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createWebRoot() {
  const root = await mkdtemp(join(tmpdir(), "dolphin-desktop-test-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "(class-terminal)"), { recursive: true });
  await mkdir(join(root, "_expo", "static", "js", "web"), {
    recursive: true,
  });
  await writeFile(join(root, "index.html"), "<h1>DolphinCloud</h1>", "utf8");
  await writeFile(
    join(root, "(class-terminal)", "index.html"),
    "<h1>海豚云班级端</h1>",
    "utf8",
  );
  await writeFile(
    join(root, "_expo", "static", "js", "web", "entry.js"),
    "globalThis.__DOLPHIN__ = true;",
    "utf8",
  );
  return root;
}

describe("desktop static server", () => {
  it("binds only to loopback on a random port and serves the class terminal", async () => {
    const server = await startStaticServer({ rootDirectory: await createWebRoot() });
    runningServers.push(server);

    expect(server.host).toBe(LOOPBACK_HOST);
    expect(server.port).toBeGreaterThan(0);
    const response = await fetch(`${server.origin}/(class-terminal)/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<h1>海豚云班级端</h1>");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain(
      "object-src 'none'",
    );
  });

  it("serves static assets with their content type", async () => {
    const server = await startStaticServer({ rootDirectory: await createWebRoot() });
    runningServers.push(server);

    const response = await fetch(`${server.origin}/_expo/static/js/web/entry.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toContain("immutable");
  });

  it("rejects traversal paths before filesystem access", async () => {
    const root = await createWebRoot();
    expect(resolveStaticCandidates(root, "/../secret.txt")).toBeNull();
    expect(resolveStaticCandidates(root, "/%2e%2e/secret.txt")).toBeNull();
    expect(resolveStaticCandidates(root, "/..%2fsecret.txt")).toBeNull();
    expect(resolveStaticCandidates(root, "/folder%5c..%5csecret.txt")).toBeNull();
    expect(resolveStaticCandidates(root, "/file%00.txt")).toBeNull();
  });

  it("returns 404 for unknown paths and 405 for writes", async () => {
    const server = await startStaticServer({ rootDirectory: await createWebRoot() });
    runningServers.push(server);

    const missingResponse = await fetch(`${server.origin}/not-present`);
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.text()).toBe("Not Found");

    const writeResponse = await fetch(`${server.origin}/index.html`, {
      method: "POST",
    });
    expect(writeResponse.status).toBe(405);
    expect(writeResponse.headers.get("allow")).toBe("GET, HEAD");
  });
});
