const express = require("express");
const { query } = require("../db");
const { badRequest, forbidden } = require("../errors");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

async function canAccessProject(user, projectId) {
  if (user.role === "admin" || user.role === "manager") return true;
  const membership = await query(
    "select 1 from project_members where project_id = $1 and user_id = $2 limit 1",
    [projectId, user.sub]
  );
  return membership.rowCount > 0;
}

router.get("/activity", requireAuth, async (req, res, next) => {
  try {
    const projectId = req.query.projectId ? String(req.query.projectId) : "";
    const limitRaw = req.query.limit ? Number(req.query.limit) : 50;
    const limit = Number.isInteger(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;

    if (!projectId) throw badRequest("projectId query param is required");
    const allowed = await canAccessProject(req.auth, projectId);
    if (!allowed) throw forbidden("No access to this project");

    const result = await query(
      `select
         al.id,
         al.actor_id,
         coalesce(u.name, 'System') as actor_name,
         al.entity_type,
         al.entity_id,
         al.action,
         al.meta_json,
         al.created_at
       from activity_logs al
       left join users u on u.id = al.actor_id
       where (al.entity_type = 'project' and al.entity_id = $1)
          or (al.entity_type = 'task' and al.entity_id in (select id from tasks where project_id = $1))
       order by al.created_at desc
       limit $2`,
      [projectId, limit]
    );

    res.json({ activity: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
