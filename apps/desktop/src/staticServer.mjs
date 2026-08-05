import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

export const LOOPBACK_HOST = "127.0.0.1";

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self' https: wss:",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

function decodeRequestPath(requestUrl) {
  const rawPath = requestUrl.split(/[?#]/u, 1)[0] ?? "/";
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return null;
  }

  if (
    !decodedPath.startsWith("/") ||
    decodedPath.includes("\0") ||
    decodedPath.includes("\\") ||
    decodedPath.split("/").some((segment) => segment === "..")
  ) {
    return null;
  }
  return decodedPath;
}

export function resolveStaticCandidates(rootDirectory, requestUrl) {
  const decodedPath = decodeRequestPath(requestUrl);
  if (decodedPath === null) {
    return null;
  }

  const normalizedRoot = resolve(rootDirectory);
  const requestedPath = resolve(normalizedRoot, `.${decodedPath}`);
  const relativePath = relative(normalizedRoot, requestedPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return null;
  }

  if (decodedPath.endsWith("/")) {
    return [join(requestedPath, "index.html")];
  }
  if (extname(requestedPath) === "") {
    return [requestedPath, join(requestedPath, "index.html")];
  }
  return [requestedPath];
}

async function findReadableFile(candidates) {
  for (const candidate of candidates) {
    try {
      const fileStat = await stat(candidate);
      if (fileStat.isFile()) {
        return { filePath: candidate, size: fileStat.size };
      }
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") {
        throw error;
      }
    }
  }
  return null;
}

function setSecurityHeaders(response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }
}

function writeTextResponse(response, statusCode, message) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(message);
}

export function createStaticRequestHandler(rootDirectory) {
  return async function handleStaticRequest(request, response) {
    setSecurityHeaders(response);
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      writeTextResponse(response, 405, "Method Not Allowed");
      return;
    }

    const candidates = resolveStaticCandidates(rootDirectory, request.url ?? "/");
    if (candidates === null) {
      writeTextResponse(response, 403, "Forbidden");
      return;
    }

    const file = await findReadableFile(candidates);
    if (file === null) {
      writeTextResponse(response, 404, "Not Found");
      return;
    }

    response.statusCode = 200;
    response.setHeader("Content-Length", String(file.size));
    response.setHeader(
      "Content-Type",
      CONTENT_TYPES.get(extname(file.filePath).toLowerCase()) ??
        "application/octet-stream",
    );
    response.setHeader(
      "Cache-Control",
      file.filePath.includes(`${join("_expo", "static")}`)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    );

    if (request.method === "HEAD") {
      response.end();
      return;
    }
    await pipeline(createReadStream(file.filePath), response);
  };
}

export async function startStaticServer({ rootDirectory }) {
  const rootStat = await stat(rootDirectory);
  if (!rootStat.isDirectory()) {
    throw new Error(`Desktop Web root is not a directory: ${rootDirectory}`);
  }

  const requestHandler = createStaticRequestHandler(rootDirectory);
  const server = createServer((request, response) => {
    void requestHandler(request, response).catch(() => {
      if (!response.headersSent) {
        setSecurityHeaders(response);
        writeTextResponse(response, 500, "Internal Server Error");
      } else {
        response.destroy();
      }
    });
  });

  await new Promise((resolveListening, rejectListening) => {
    server.once("error", rejectListening);
    server.listen({ host: LOOPBACK_HOST, port: 0 }, () => {
      server.off("error", rejectListening);
      resolveListening();
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Desktop static server did not expose a TCP address.");
  }

  return {
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) {
            rejectClose(error);
          } else {
            resolveClose();
          }
        });
        server.closeAllConnections();
      }),
    host: address.address,
    origin: `http://${LOOPBACK_HOST}:${address.port}`,
    port: address.port,
  };
}
