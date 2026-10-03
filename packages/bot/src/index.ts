import http from "node:http";
import { APP_NAME, INTERNAL_HEALTH_PATH } from "@discordgate/shared";

// ponytail: health-only internal server; the Discord client lands in a later milestone
const port = Number(process.env.BOT_PORT ?? 3002);

const server = http.createServer((req, res) => {
  if (req.url === INTERNAL_HEALTH_PATH) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ app: APP_NAME, service: "bot", status: "ok" }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, () => {
  console.log(`[${APP_NAME}] bot internal server listening on :${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}