const express = require("express");
const { query } = require("../db");
const { forbidden, notFound } = require("../errors");
const { requireAuth } = require("../middleware/auth");
const { emitToUser } = require("../realtime");

const router = express.Router();

router.get("/notifications", requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth.sub;

    const result = await query(
      `select n.id, n.user_id, n.task_id, n.type, n.title, n.message, n.is_read, n.created_at, n.remind_at,
              t.title as task_title, t.status as task_status
       from notifications n
       left join tasks t on t.id = n.task_id
       where n.user_id = $1
       order by n.is_read asc, coalesce(n.remind_at, n.created_at) desc
       limit 100`,
      [userId]
    );
    const unread = result.rows.filter((row) => !row.is_read).length;
    res.json({ notifications: result.rows, unread });
  } catch (error) {
    next(error);
  }
});

router.get("/notifications/metrics", requireAuth, async (req, res, next) => {
  try {
    const userId = req.auth.sub;
    const summary = await query(
      `select
         count(*)::int as total_count,
         count(*) filter (where is_read = false)::int as unread_count,
         count(*) filter (where created_at >= now() - interval '24 hours')::int as last_24h_count,
         count(*) filter (
           where is_read = false
             and type in ('task.sla.escalated', 'task.sla.overdue', 'task.review.reminder')
         )::int as critical_unread_count
       from notifications
       where user_id = $1`,
      [userId]
    );
    const byType = await query(
      `select type, count(*)::int as count
       from notifications
       where user_id = $1
         and created_at >= now() - interval '7 days'
       group by type
       order by count desc`,
      [userId]
    );
    res.json({ metrics: summary.rows[0], byType7d: byType.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/notifications/:notificationId/read", requireAuth, async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const existing = await query("select id, user_id from notifications where id = $1 limit 1", [notificationId]);
    const notification = existing.rows[0];
    if (!notification) throw notFound("Notification not found");
    if (notification.user_id !== req.auth.sub) throw forbidden("Cannot modify this notification");

    await query("update notifications set is_read = true where id = $1", [notificationId]);
    emitToUser(req.auth.sub, "notification.read", { notificationId });
    res.json({ ok: true, notificationId });
  } catch (error) {
    next(error);
  }
});

router.post("/notifications/read-all", requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `update notifications
       set is_read = true
       where user_id = $1 and is_read = false`,
      [req.auth.sub]
    );
    emitToUser(req.auth.sub, "notification.read_all", {});
    res.json({ ok: true, updated: result.rowCount || 0 });
  } catch (error) {
    next(error);
  }
});

router.delete("/notifications/read", requireAuth, async (req, res, next) => {
  try {
    const olderThanDays = Number(req.query.olderThanDays || 14);
    const safeDays = Number.isInteger(olderThanDays) ? Math.min(Math.max(1, olderThanDays), 365) : 14;
    const result = await query(
      `delete from notifications
       where user_id = $1
         and is_read = true
         and created_at <= now() - make_interval(days => $2)`,
      [req.auth.sub, safeDays]
    );
    emitToUser(req.auth.sub, "notification.cleared", { deleted: result.rowCount || 0 });
    res.json({ ok: true, deleted: result.rowCount || 0 });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
