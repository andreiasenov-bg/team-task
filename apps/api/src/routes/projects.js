const express = require("express");
const { query } = require("../db");
const { badRequest, forbidden } = require("../errors");
const { requireAuth } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { emitGlobal } = require("../realtime");

const router = express.Router();

async function canAccessProject(user, projectId) {
  if (user.role === "admin" || user.role === "manager") return true;
  const membership = await query(
    "select 1 from project_members where project_id = $1 and user_id = $2 limit 1",
    [projectId, user.sub]
  );
  return membership.rowCount > 0;
}

router.get("/projects", requireAuth, async (req, res, next) => {
  try {
    const role = req.auth.role;
    if (role === "admin" || role === "manager") {
      const all = await query(
        "select id, title, description, owner_id, status, created_at from projects where archived = false order by created_at desc"
      );
      return res.json({ projects: all.rows });
    }

    const scoped = await query(
      `select p.id, p.title, p.description, p.owner_id, p.status, p.created_at
       from projects p
       join project_members pm on pm.project_id = p.id
       where p.archived = false and pm.user_id = $1
       order by p.created_at desc`,
      [req.auth.sub]
    );
    return res.json({ projects: scoped.rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/projects/:projectId/members", requireAuth, async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const allowed = await canAccessProject(req.auth, projectId);
    if (!allowed) throw forbidden("No access to this project");

    const result = await query(
      `select u.id, u.name, u.email, u.role, pm.role as project_role
       from project_members pm
       join users u on u.id = pm.user_id
       where pm.project_id = $1 and u.is_active = true
       order by u.name asc`,
      [projectId]
    );
    res.json({ members: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/projects", requireAuth, requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const { title, description = "", status = "active" } = req.body || {};
    if (!title || !String(title).trim()) throw badRequest("title is required");
    if (String(title).trim().length > 180) throw badRequest("title too long");
    if (String(description).length > 5000) throw badRequest("description too long");
    if (!["active", "paused", "completed"].includes(String(status))) {
      throw badRequest("invalid project status");
    }

    const inserted = await query(
      `insert into projects (title, description, owner_id, status)
       values ($1, $2, $3, $4)
       returning id, title, description, owner_id, status, created_at`,
      [String(title).trim(), String(description), req.auth.sub, String(status)]
    );

    const project = inserted.rows[0];
    await query(
      "insert into project_members (project_id, user_id, role) values ($1, $2, $3) on conflict do nothing",
      [project.id, req.auth.sub, "owner"]
    );
    await query(
      `insert into activity_logs (actor_id, entity_type, entity_id, action, meta_json)
       values ($1, 'project', $2, 'project.created', $3::jsonb)`,
      [req.auth.sub, project.id, JSON.stringify({ title: project.title })]
    );

    emitGlobal("project.created", { project });

    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
