const PORT = 3100; // keep in sync with playwright.config.ts

export const siteUrl = (path = "/") => `http://localhost:${PORT}${path}`;
export const platformUrl = (path = "/") => `http://admin.localhost:${PORT}${path}`;
export const instituteUrl = (subdomain: string, path = "/") => `http://${subdomain}.localhost:${PORT}${path}`;

/** Sign-in is rate limited (10/min per address), which a whole suite on one machine would trip; clear it before signing in. */
export async function clearRateLimits() {
  const { config: loadEnv } = await import("dotenv");
  loadEnv({ path: ".env.test", override: true, quiet: true });
  const { createTestDb } = await import("../src/server/core/testing/db");
  const { sql } = await import("drizzle-orm");
  const { db, close } = createTestDb();
  try {
    await db.execute(sql`DELETE FROM rate_limits`);
  } finally {
    await close();
  }
}

/** Creates an active institute through the real platform service, as a Super Admin would. */
export async function seedInstitute(input: { name: string; subdomain: string; ownerName: string; ownerEmail: string; password: string; modules: string[] }) {
  const { config: loadEnv } = await import("dotenv");
  loadEnv({ path: ".env.test", override: true, quiet: true });
  const { createTestDb } = await import("../src/server/core/testing/db");
  const { createTenant } = await import("../src/server/modules/platform/service");
  const { sql } = await import("drizzle-orm");
  const { db, close } = createTestDb();
  try {
    const [admin] = await db.execute<{ id: string }>(sql`select id from platform_users order by created_at limit 1`);
    await createTenant(
      db as never,
      {
        name: input.name,
        subdomain: input.subdomain,
        starterModuleKeys: input.modules as never,
        ownerName: input.ownerName,
        ownerEmail: input.ownerEmail,
        temporaryPassword: input.password,
      },
      { platformUserId: admin.id },
    );
  } finally {
    await close();
  }
}

/** Sets an institute's status directly (what the Super Admin's status actions do), for pages that depend on it. */
export async function setInstituteStatus(subdomain: string, status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED") {
  const { config: loadEnv } = await import("dotenv");
  loadEnv({ path: ".env.test", override: true, quiet: true });
  const { createTestDb } = await import("../src/server/core/testing/db");
  const { sql } = await import("drizzle-orm");
  const { db, close } = createTestDb();
  try {
    await db.execute(sql`update tenants set status = ${status} where subdomain = ${subdomain}`);
  } finally {
    await close();
  }
}

/** Switches modules on or off directly (what the Super Admin's module toggles do), e.g. `{ fees: false }`. */
export async function setInstituteModules(subdomain: string, changes: Record<string, boolean>) {
  const { config: loadEnv } = await import("dotenv");
  loadEnv({ path: ".env.test", override: true, quiet: true });
  const { createTestDb } = await import("../src/server/core/testing/db");
  const { sql } = await import("drizzle-orm");
  const { db, close } = createTestDb();
  try {
    for (const [key, enabled] of Object.entries(changes)) {
      await db.execute(sql`
        insert into tenant_modules (tenant_id, module_id, enabled, enabled_at)
        select t.id, m.id, ${enabled}, case when ${enabled} then now() end from tenants t, modules m
        where t.subdomain = ${subdomain} and m.key = ${key}
        on conflict (tenant_id, module_id) do update set enabled = excluded.enabled, enabled_at = excluded.enabled_at`);
    }
  } finally {
    await close();
  }
}

/**
 * Sets up teaching through the real services (what the Owner does on screen in courses/portals specs): a course with
 * two subjects in one batch, each with a class every day of the week, an instructor teaching the first subject, and
 * students admitted 30 days ago. The instructor (with their password) and the students (by student ID, password
 * "Student123") can sign in straight away.
 */
export async function seedTeaching(input: {
  subdomain: string;
  instructor: { fullName: string; email: string; password: string };
  subjects: [string, string];
  students: string[];
  /** More instructors who teach nothing yet (e.g. a substitute). */
  extraInstructors?: { fullName: string; email: string; password: string }[];
}) {
  const { config: loadEnv } = await import("dotenv");
  loadEnv({ path: ".env.test", override: true, quiet: true });
  const { createTestDb } = await import("../src/server/core/testing/db");
  const { sql } = await import("drizzle-orm");
  const academic = await import("../src/server/modules/academic/service");
  const { createInstructor } = await import("../src/server/modules/instructors/service");
  const { admitStudent } = await import("../src/server/modules/students/service");
  const { todayInDhaka } = await import("../src/lib/dates");
  const { db, close } = createTestDb();
  const d = db as never;
  try {
    const [t] = await db.execute<{ id: string; owner: string }>(sql`select id, owner_user_id as owner from tenants where subdomain = ${input.subdomain}`);
    const actor = { tenantId: t.id, userId: t.owner };
    const course = await academic.createCourse(d, actor, { name: "SSC Science", code: "SSC", dueDay: 10 });
    const batch = await academic.createBatch(d, actor, course.id, { name: "Evening" });
    const { instructor } = await createInstructor(d, actor, { fullName: input.instructor.fullName, email: input.instructor.email, temporaryPassword: input.instructor.password });
    await db.execute(sql`update users set must_change_password = false where tenant_id = ${t.id} and email = ${input.instructor.email}`);
    for (const extra of input.extraInstructors ?? []) {
      await createInstructor(d, actor, { fullName: extra.fullName, email: extra.email, temporaryPassword: extra.password });
      await db.execute(sql`update users set must_change_password = false where tenant_id = ${t.id} and email = ${extra.email}`);
    }
    const batchSubjects = [];
    for (const [i, name] of input.subjects.entries()) {
      const subject = await academic.createSubject(d, actor, course.id, { name });
      const bs = await academic.addBatchSubject(d, actor, batch.id, subject.id);
      for (const weekday of academic.WEEKDAYS) {
        await academic.addScheduleSlot(d, actor, bs.id, { weekday, startsAt: i === 0 ? "16:00" : "17:30", endsAt: i === 0 ? "17:00" : "18:30" });
      }
      batchSubjects.push(bs);
    }
    await academic.setBatchSubjectInstructors(d, actor, batchSubjects[0].id, [instructor.id]);
    const admissionDate = new Date(Date.parse(`${todayInDhaka()}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
    const codes: string[] = [];
    for (const fullName of input.students) {
      const { student } = await admitStudent(d, actor, {
        fullName, gender: "FEMALE", guardianName: "Guardian", guardianRelation: "MOTHER", guardianPhone: "01711000999", admissionDate, batchIds: [batch.id], temporaryPassword: "Student123",
      });
      codes.push(student.studentCode);
      await db.execute(sql`update users set must_change_password = false where tenant_id = ${t.id} and id = ${student.userId}`);
    }
    return { codes };
  } finally {
    await close();
  }
}
