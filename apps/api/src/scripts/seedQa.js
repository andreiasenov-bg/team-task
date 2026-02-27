const { pool, query, bootstrapSchema } = require("../db");

async function seedQa() {
  await bootstrapSchema();

  const manager = await query("select id from users where email = $1 limit 1", ["manager@nexus-flow.local"]);
  const employee = await query("select id from users where email = $1 limit 1", ["ivan@nexus-flow.local"]);
  if (manager.rowCount === 0 || employee.rowCount === 0) {
    throw new Error("Missing baseline users. Run seed.js first.");
  }

  let projectId = "";
  const existingProject = await query("select id from projects where title = $1 limit 1", ["QA Scenario Board"]);
  if (existingProject.rowCount > 0) {
    projectId = existingProject.rows[0].id;
  } else {
    const inserted = await query(
      `insert into projects (title, description, owner_id, status)
       values ($1, $2, $3, 'active')
       returning id`,
      ["QA Scenario Board", "Scenarios for staging validation", manager.rows[0].id]
    );
    projectId = inserted.rows[0].id;
  }

  await query(
    `insert into project_members (project_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'member')
     on conflict do nothing`,
    [projectId, manager.rows[0].id, employee.rows[0].id]
  );

  const scenarios = [
    {
      title: "QA todo baseline",
      description: "Visible in todo for employee dashboard checks",
      priority: "medium",
      status: "todo",
      dueDateSql: "now() + interval '1 day'",
      position: 1000,
    },
    {
      title: "QA in progress overdue",
      description: "Used for SLA and reminder checks",
      priority: "high",
      status: "in_progress",
      dueDateSql: "now() - interval '2 hours'",
      position: 2000,
    },
    {
      title: "QA done waiting review",
      description: "Used for approve/reject workflow checks",
      priority: "low",
      status: "done",
      dueDateSql: "now() - interval '1 hour'",
      position: 3000,
    },
  ];

  for (const scenario of scenarios) {
    const exists = await query(
      "select id from tasks where project_id = $1 and title = $2 limit 1",
      [projectId, scenario.title]
    );
    if (exists.rowCount > 0) {
      continue;
    }
    await query(
      `insert into tasks (
        project_id,
        assigned_to,
        title,
        description,
        priority,
        status,
        position,
        due_date,
        sla_due_at
      )
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        ${scenario.dueDateSql},
        now() + interval '3 hours'
      )`,
      [
        projectId,
        employee.rows[0].id,
        scenario.title,
        scenario.description,
        scenario.priority,
        scenario.status,
        scenario.position,
      ]
    );
  }

  // eslint-disable-next-line no-console
  console.log("QA seed complete.");
}

seedQa()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
