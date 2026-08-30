const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname);
const host = "127.0.0.1";
const configuredPort = Number.parseInt(process.env.SKIN_REBUILD_PORT ?? "4173", 10);
const initialPort = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort < 65536
  ? configuredPort
  : 4173;
let port = initialPort;
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".fkei", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".wasm", "application/wasm"],
]);

const server = http.createServer((request, response) => {
  let requested;
  try {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    const relative = decodeURIComponent(url.pathname === "/" ? "/skin-rebuild.html" : url.pathname).replace(/^[/\\]+/, "");
    requested = path.resolve(root, relative);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  if (requested !== root && !requested.startsWith(root + path.sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.stat(requested, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(requested).toLowerCase()) ?? "application/octet-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    });
    const stream = fs.createReadStream(requested);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  });
});

server.listen(port, host, () => {
  const appUrl = `http://${host}:${port}/skin-rebuild.html?build=0.90.6`;
  console.log(`SKIN REBUILD is running at ${appUrl}`);
  console.log("Close this window or press Ctrl+C to stop.");
  if (process.env.SKIN_REBUILD_NO_OPEN !== "1") {
    const browser = spawn("cmd.exe", ["/c", "start", "", appUrl], {
      detached: true,
      stdio: "ignore",
    });
    browser.unref();
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && port < Math.min(initialPort + 20, 65535)) {
    port += 1;
    console.log(`Port ${port - 1} is already in use; trying ${port}.`);
    server.listen(port, host);
    return;
  }
  console.error(`SKIN REBUILD could not start: ${error.message}`);
  process.exitCode = 1;
});
