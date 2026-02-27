const express = require("express");
const { query } = require("../db");
const { badRequest, forbidden } = require("../errors");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const WEEKDAY_TO_INDEX = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };

async function canAccessProject(user, projectId) {
  if (user.role === "admin" || user.role === "manager") return true;
  const membership = await query(
    "select 1 from project_members where project_id = $1 and user_id = $2 limit 1",
    [projectId, user.sub]
  );
  return membership.rowCount > 0;
}

function parseRange(req) {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date();
  const to = req.query.to
    ? new Date(String(req.query.to))
    : new Date(from.getTime() + 1000 * 60 * 60 * 24 * 62);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw badRequest("invalid from/to range");
  }
  return { from, to };
}

function toUtcStamp(d) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function monthDayClamp(year, month, wantedDay) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.min(wantedDay, lastDay);
}

function lastBusinessDay(year, month) {
  const d = new Date(Date.UTC(year, month + 1, 0));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.getUTCDate();
}

function pushOccurrence(events, task, at) {
  const end = new Date(at.getTime() + 1000 * 60 * 60);
  events.push({
    id: `${task.id}@${toUtcStamp(at)}`,
    taskId: task.id,
    title: task.title,
    start: at.toISOString(),
    end: end.toISOString(),
    status: task.status,
    reviewStatus: task.review_status,
    recurrenceType: task.recurrence_type,
    archived: Boolean(task.archived_at),
  });
}

function expandTask(task, from, to) {
  const events = [];
  if (!task.due_date) return events;

  const startDate = new Date(task.due_date);
  const recurrenceType = task.recurrence_type || "none";
  const interval = Math.max(1, Number(task.recurrence_interval || 1));
  const recurrenceEndAt = task.recurrence_end_at ? new Date(task.recurrence_end_at) : null;

  function inRange(d) {
    if (d < from || d > to) return false;
    if (recurrenceEndAt && d > recurrenceEndAt) return false;
    return true;
  }

  if (recurrenceType === "none") {
    if (inRange(startDate)) pushOccurrence(events, task, startDate);
    return events;
  }

  if (recurrenceType === "daily") {
    const cursor = new Date(startDate);
    while (cursor <= to) {
      if (inRange(cursor)) pushOccurrence(events, task, new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + interval);
    }
    return events;
  }

  if (recurrenceType === "weekly") {
    const weekdays = Array.isArray(task.recurrence_weekdays) && task.recurrence_weekdays.length > 0
      ? task.recurrence_weekdays
      : ["mon"];
    const startWeek = new Date(startDate);
    startWeek.setUTCHours(startDate.getUTCHours(), startDate.getUTCMinutes(), startDate.getUTCSeconds(), 0);

    const cursor = new Date(startWeek);
    while (cursor <= to) {
      const weekDiff = Math.floor((cursor - startWeek) / (1000 * 60 * 60 * 24 * 7));
      if (weekDiff % interval === 0) {
        for (const wd of weekdays) {
          const target = new Date(cursor);
          const wanted = WEEKDAY_TO_INDEX[String(wd)] ?? 1;
          const current = target.getUTCDay();
          const delta = wanted - current;
          target.setUTCDate(target.getUTCDate() + delta);
          target.setUTCHours(startDate.getUTCHours(), startDate.getUTCMinutes(), startDate.getUTCSeconds(), 0);
          if (target < startDate) continue;
          if (inRange(target)) pushOccurrence(events, task, target);
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return events;
  }

  if (recurrenceType === "monthly") {
    const wantedDay = Number(task.recurrence_day_of_month || startDate.getUTCDate());
    const monthlyMode = String(task.recurrence_monthly_mode || "day_of_month");
    const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
    while (cursor <= to) {
      const monthDiff =
        (cursor.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
        (cursor.getUTCMonth() - startDate.getUTCMonth());
      if (monthDiff >= 0 && monthDiff % interval === 0) {
        const day =
          monthlyMode === "last_business_day"
            ? lastBusinessDay(cursor.getUTCFullYear(), cursor.getUTCMonth())
            : monthDayClamp(cursor.getUTCFullYear(), cursor.getUTCMonth(), wantedDay);
        const target = new Date(
          Date.UTC(
            cursor.getUTCFullYear(),
            cursor.getUTCMonth(),
            day,
            startDate.getUTCHours(),
            startDate.getUTCMinutes(),
            startDate.getUTCSeconds()
          )
        );
        if (target >= startDate && inRange(target)) pushOccurrence(events, task, target);
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return events;
  }

  return events;
}

router.get("/calendar/events", requireAuth, async (req, res, next) => {
  try {
    const projectId = req.query.projectId ? String(req.query.projectId) : "";
    if (!projectId) throw badRequest("projectId query param is required");
    if (!(await canAccessProject(req.auth, projectId))) throw forbidden("No access to this project");
    const { from, to } = parseRange(req);

    const rows = await query(
      `select id, title, due_date, status, review_status, archived_at,
              recurrence_type, recurrence_interval, recurrence_weekdays, recurrence_day_of_month, recurrence_monthly_mode, recurrence_end_at
       from tasks
       where project_id = $1 and due_date is not null`,
      [projectId]
    );

    const events = [];
    for (const task of rows.rows) {
      if (task.archived_at) continue;
      events.push(...expandTask(task, from, to));
    }
    events.sort((a, b) => new Date(a.start) - new Date(b.start));
    res.json({ events, from: from.toISOString(), to: to.toISOString() });
  } catch (error) {
    next(error);
  }
});

router.get("/calendar.ics", requireAuth, async (req, res, next) => {
  try {
    const projectId = req.query.projectId ? String(req.query.projectId) : "";
    if (!projectId) throw badRequest("projectId query param is required");
    if (!(await canAccessProject(req.auth, projectId))) throw forbidden("No access to this project");
    const { from, to } = parseRange(req);

    const rows = await query(
      `select id, title, due_date, status, review_status, archived_at,
              recurrence_type, recurrence_interval, recurrence_weekdays, recurrence_day_of_month, recurrence_monthly_mode, recurrence_end_at
       from tasks
       where project_id = $1 and due_date is not null`,
      [projectId]
    );

    const events = [];
    for (const task of rows.rows) {
      if (task.archived_at) continue;
      events.push(...expandTask(task, from, to));
    }

    const now = new Date();
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//listO//Calendar//EN",
      "CALSCALE:GREGORIAN",
    ];
    for (const ev of events) {
      const start = new Date(ev.start);
      const end = new Date(ev.end);
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${ev.id}@nexus-flow.local`);
      lines.push(`DTSTAMP:${toUtcStamp(now)}`);
      lines.push(`DTSTART:${toUtcStamp(start)}`);
      lines.push(`DTEND:${toUtcStamp(end)}`);
      lines.push(`SUMMARY:${String(ev.title).replace(/\n/g, " ")}`);
      lines.push(`DESCRIPTION:Status=${ev.status};Review=${ev.reviewStatus}`);
      lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"listo-${projectId}.ics\"`);
    res.send(lines.join("\r\n"));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
