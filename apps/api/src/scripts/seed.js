const { pool, query, bootstrapSchema } = require("../db");
const { hashPassword } = require("../security");

async function seed() {
  await bootstrapSchema();

  const adminEmail = "admin@nexus-flow.local";
  const managerEmail = "manager@nexus-flow.local";
  const employeeEmail = "ivan@nexus-flow.local";

  const adminHash = await hashPassword("admin123");
  const managerHash = await hashPassword("manager123");
  const employeeHash = await hashPassword("123456");

  await query(
    `insert into users (name, email, password_hash, role)
     values
       ('Admin', $1, $2, 'admin'),
       ('Manager', $3, $4, 'manager'),
       ('Ivan', $5, $6, 'employee')
     on conflict (email) do nothing`,
    [adminEmail, adminHash, managerEmail, managerHash, employeeEmail, employeeHash]
  );

  const manager = await query("select id from users where email = $1 limit 1", [managerEmail]);
  const ivan = await query("select id from users where email = $1 limit 1", [employeeEmail]);
  const admin = await query("select id from users where email = $1 limit 1", [adminEmail]);

  let projectId = "";
  const existingProject = await query("select id from projects where title = $1 limit 1", ["listO Launch"]);
  if (existingProject.rowCount > 0) {
    projectId = existingProject.rows[0].id;
  } else {
    const inserted = await query(
      `insert into projects (title, description, owner_id, status)
       values ('listO Launch', 'Initial migration project', $1, 'active')
       returning id`,
      [manager.rows[0].id]
    );
    projectId = inserted.rows[0].id;
  }

  await query(
    `insert into project_members (project_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'member')
     on conflict do nothing`,
    [projectId, manager.rows[0].id, ivan.rows[0].id]
  );

  const existingTask = await query(
    "select id from tasks where project_id = $1 and title = $2 limit 1",
    [projectId, "Migrate API to JWT + RBAC"]
  );
  if (existingTask.rowCount === 0) {
    await query(
      `insert into tasks (project_id, assigned_to, title, description, priority, status, position)
       values ($1, $2, 'Migrate API to JWT + RBAC', 'Bootstrap modern API architecture', 'high', 'todo', 1000)`,
      [projectId, ivan.rows[0].id]
    );
  }

  await query(
    `insert into assistant_dynamic_skills (skill_key, title, description, roles, query_sql, enabled, created_by)
     values ($1, $2, $3, $4::text[], $5, true, $6)
     on conflict (skill_key)
     do update set
       title = excluded.title,
       description = excluded.description,
       roles = excluded.roles,
       query_sql = excluded.query_sql,
       enabled = true,
       updated_at = now()`,
    [
      "overdue-mine",
      "My Overdue Tasks (SQL)",
      "Dynamic skill: list your overdue open tasks",
      ["employee", "manager", "admin"],
      "select id, title, status, due_date from tasks where archived_at is null and status <> 'done' and assigned_to in (select id from users where is_active = true) and due_date is not null and due_date < now() order by due_date asc limit 10",
      admin.rows[0].id,
    ]
  );

  // eslint-disable-next-line no-console
  console.log("Seed complete.");
}

seed()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
