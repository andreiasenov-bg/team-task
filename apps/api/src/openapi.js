const spec = {
  openapi: "3.0.3",
  info: {
    title: "Nexus Flow API",
    version: "0.1.0",
    description: "API for projects, tasks, auth, activity, and realtime support.",
  },
  servers: [
    { url: "http://127.0.0.1:3320", description: "Local API" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        summary: "Health check",
        responses: { 200: { description: "OK" } },
      },
    },
    "/api/auth/login": {
      post: {
        summary: "Login",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 200: { description: "JWT token + user" } },
      },
    },
    "/api/auth/me": {
      get: {
        summary: "Current user",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Current user profile" } },
      },
    },
    "/api/projects": {
      get: {
        summary: "List projects",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Projects list" } },
      },
      post: {
        summary: "Create project (admin/manager)",
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: "Project created" } },
      },
    },
    "/api/projects/{projectId}/members": {
      get: {
        summary: "List project members",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "projectId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: { 200: { description: "Members list" } },
      },
    },
    "/api/tasks": {
      get: {
        summary: "List tasks by project",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "projectId",
            in: "query",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "search",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "status",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["todo", "in_progress", "done"] },
          },
          {
            name: "review",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["pending", "approved", "rejected"] },
          },
          {
            name: "assigneeId",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "includeArchived",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["0", "1"] },
          },
        ],
        responses: { 200: { description: "Tasks list" } },
      },
      post: {
        summary: "Create task",
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: "Task created" } },
      },
    },
    "/api/tasks/{taskId}/status": {
      patch: {
        summary: "Move task across columns",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "taskId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: { 200: { description: "Task moved" } },
      },
    },
    "/api/tasks/{taskId}/comments": {
      get: {
        summary: "List task comments",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Comments list" } },
      },
      post: {
        summary: "Add task comment",
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: "Comment created" } },
      },
    },
    "/api/tasks/{taskId}/review": {
      patch: {
        summary: "Approve or reject completed task (admin/manager)",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Task reviewed" } },
      },
    },
    "/api/tasks/{taskId}/archive": {
      patch: {
        summary: "Archive or unarchive task (admin/manager)",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Task archive state updated" } },
      },
    },
    "/api/tasks/{taskId}/schedule": {
      patch: {
        summary: "Update due date and recurring schedule for a task",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Task schedule updated" } },
      },
    },
    "/api/activity": {
      get: {
        summary: "Project activity timeline",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "projectId",
            in: "query",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 200 },
          },
        ],
        responses: { 200: { description: "Activity list" } },
      },
    },
    "/api/notifications": {
      get: {
        summary: "List user notifications",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Notifications list" } },
      },
    },
    "/api/notifications/metrics": {
      get: {
        summary: "Get notification metrics for current user",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Notification metrics" } },
      },
    },
    "/api/notifications/{notificationId}/read": {
      post: {
        summary: "Mark notification as read",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Notification marked read" } },
      },
    },
    "/api/notifications/read-all": {
      post: {
        summary: "Mark all notifications as read",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Notifications marked read" } },
      },
    },
    "/api/notifications/read": {
      delete: {
        summary: "Clear read notifications older than N days",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Read notifications cleared" } },
      },
    },
    "/api/notification-preferences": {
      get: {
        summary: "Get current user notification preferences",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Notification preferences" } },
      },
      patch: {
        summary: "Update current user notification preferences",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Notification preferences updated" } },
      },
    },
    "/api/admin/sla-policy": {
      get: {
        summary: "Get live SLA reminder policy (admin/manager)",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "SLA policy" } },
      },
      patch: {
        summary: "Update live SLA reminder policy (admin/manager)",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "SLA policy updated" } },
      },
    },
    "/api/calendar/events": {
      get: {
        summary: "Get expanded calendar events for tasks in date range",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Calendar events" } },
      },
    },
    "/api/calendar.ics": {
      get: {
        summary: "Download calendar feed as iCal (.ics)",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "ICS file" } },
      },
    },
    "/api/integrations/whatsapp/link": {
      patch: {
        summary: "Link current user with WhatsApp phone number",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "User link updated" } },
      },
    },
    "/api/integrations/whatsapp/metrics": {
      get: {
        summary: "Get WhatsApp assistant metrics (admin/manager)",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Assistant metrics" } },
      },
    },
    "/api/integrations/whatsapp/queue": {
      get: {
        summary: "List WhatsApp outbound queue items (admin/manager)",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Queue list" } },
      },
    },
    "/api/integrations/whatsapp/queue/{queueId}/requeue": {
      patch: {
        summary: "Requeue a WhatsApp outbound item (admin/manager)",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Queue item updated" } },
      },
    },
    "/api/integrations/whatsapp/webhook": {
      get: {
        summary: "WhatsApp webhook verification endpoint",
        responses: { 200: { description: "Verification challenge response" } },
      },
      post: {
        summary: "WhatsApp webhook receiver for inbound messages",
        responses: { 200: { description: "Webhook accepted" } },
      },
    },
    "/api/assistant/skills": {
      get: {
        summary: "List assistant skills",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Skills list" } },
      },
      post: {
        summary: "Create dynamic assistant skill (admin/manager)",
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: "Skill created" } },
      },
    },
    "/api/assistant/skills/{skillKey}": {
      patch: {
        summary: "Update dynamic assistant skill (admin/manager)",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Skill updated" } },
      },
    },
    "/api/assistant/skill-approvals": {
      get: {
        summary: "List assistant skill approvals (admin/manager)",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Skill approvals list" } },
      },
    },
    "/api/assistant/skill-approvals/{approvalId}": {
      patch: {
        summary: "Approve/reject assistant skill request (admin/manager)",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Skill approval updated" } },
      },
    },
  },
};

module.exports = { spec };
