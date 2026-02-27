const express = require("express");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const { ApiError } = require("./errors");
const { spec } = require("./openapi");
const healthRoutes = require("./routes/health");
const authRoutes = require("./routes/auth");
const projectsRoutes = require("./routes/projects");
const tasksRoutes = require("./routes/tasks");
const activityRoutes = require("./routes/activity");
const notificationsRoutes = require("./routes/notifications");
const notificationPreferencesRoutes = require("./routes/notificationPreferences");
const calendarRoutes = require("./routes/calendar");
const whatsappRoutes = require("./routes/whatsapp");
const assistantSkillsRoutes = require("./routes/assistantSkills");
const slaPolicyRoutes = require("./routes/slaPolicy");

const app = express();
const uploadsDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

app.use((req, res, next) => {
  const requestId = randomUUID();
  const startedAt = Date.now();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: "info",
        event: "http.request",
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      })
    );
  });
  next();
});

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: "12mb" }));
app.use("/uploads", express.static(uploadsDir));

app.get("/openapi.json", (_req, res) => {
  res.json(spec);
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));

app.use("/api", healthRoutes);
app.use("/api", authRoutes);
app.use("/api", projectsRoutes);
app.use("/api", tasksRoutes);
app.use("/api", activityRoutes);
app.use("/api", notificationsRoutes);
app.use("/api", notificationPreferencesRoutes);
app.use("/api", calendarRoutes);
app.use("/api", whatsappRoutes);
app.use("/api", assistantSkillsRoutes);
app.use("/api", slaPolicyRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `Unknown endpoint: ${req.method} ${req.path}` });
});

app.use((error, _req, res, _next) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ error: error.message, requestId: _req.requestId || null });
  }
  const message = error && error.message ? error.message : "Internal server error";
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: "error", event: "http.error", requestId: _req.requestId || null, message }));
  return res.status(500).json({ error: message, requestId: _req.requestId || null });
});

module.exports = app;
