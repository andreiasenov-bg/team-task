const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const config = require("./config");
const { bootstrapSchema } = require("./db");
const { attachIO } = require("./realtime");
const { startSlaReminders } = require("./jobs/slaReminders");
const { startReviewReminders } = require("./jobs/reviewReminders");
const { startDigestNotifications } = require("./jobs/digestNotifications");
const { startWhatsappRetryQueue } = require("./integrations/whatsapp");

async function start() {
  await bootstrapSchema();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PATCH"],
    },
  });

  io.on("connection", (socket) => {
    socket.on("subscribe-user", (userId) => {
      if (!userId) return;
      socket.join(`user:${userId}`);
    });
    socket.on("unsubscribe-user", (userId) => {
      if (!userId) return;
      socket.leave(`user:${userId}`);
    });
    socket.on("subscribe-project", (projectId) => {
      if (!projectId) return;
      socket.join(`project:${projectId}`);
    });
    socket.on("unsubscribe-project", (projectId) => {
      if (!projectId) return;
      socket.leave(`project:${projectId}`);
    });
  });

  attachIO(io);
  startSlaReminders();
  startReviewReminders();
  startDigestNotifications();
  startWhatsappRetryQueue();

  server.listen(config.port, config.host, () => {
    // eslint-disable-next-line no-console
    console.log(`Nexus Flow API running on http://${config.host}:${config.port}`);
  });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start API:", error);
  process.exit(1);
});
