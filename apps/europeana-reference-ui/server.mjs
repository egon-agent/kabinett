import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 4320);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const VISUAL_SERVICE_URL = (process.env.VISUAL_SERVICE_URL || "http://127.0.0.1:4318").replace(/\/+$/, "");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function resolveFilePath(urlPath) {
  if (urlPath === "/api-contract" || urlPath === "/api-contract/") {
    return join(ROOT, "api-contract.html");
  }

  const safePath = normalize(urlPath)
    .replace(/^(\.\.(\/|\\|$))+/, "")
    .replace(/^[/\\]+/, "");
  const target = join(ROOT, safePath.length === 0 ? "index.html" : safePath);
  if (existsSync(target)) return target;
  return join(ROOT, "index.html");
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function proxyApiRequest(request, response, url) {
  const target = new URL(`${VISUAL_SERVICE_URL}${url.pathname.replace(/^\/api/, "")}${url.search}`);
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await readBody(request);
  const proxied = await fetch(target, {
    method: request.method,
    headers: {
      "Content-Type": request.headers["content-type"] || "application/json",
      Accept: request.headers.accept || "application/json",
      ...(request.headers.origin ? { Origin: String(request.headers.origin) } : {}),
    },
    body,
  });

  response.writeHead(proxied.status, {
    "Content-Type": proxied.headers.get("content-type") || "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(Buffer.from(await proxied.arrayBuffer()));
}

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    try {
      await proxyApiRequest(request, response, url);
    } catch (error) {
      response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        error: "visual_service_unavailable",
        message: error instanceof Error ? error.message : "Unknown proxy error",
      }));
    }
    return;
  }

  const filePath = resolveFilePath(url.pathname);

  try {
    const info = await stat(filePath);
    response.writeHead(200, {
      "Content-Length": info.size,
      "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(PORT, HOST, () => {
  console.log(`[europeana-reference-ui] listening on http://${HOST}:${PORT}`);
});
