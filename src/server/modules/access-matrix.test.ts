import sharp from "sharp";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../core/testing/db";
import { batchMemberships, instructors, permissions as permissionRows, rateLimits, rolePermissions, roles, signatures, tenants, userRoles } from "../core/db/schema";
import type { Db } from "../core/db/types";
import { seedPlatformCatalog } from "../core/db/seed";
import { uploadFile } from "../core/files/service";
import { LocalDiskStorage } from "../core/files/storage";
import { INSTITUTE_OWNER_ROLE, ROLE_TEMPLATES, type PermissionName } from "../core/rbac/catalog";
import * as academic from "./academic/service";
import { createAcademicHandlers } from "./academic/http";
import { createLogin } from "./auth/credentials";
import { createTenantAuth } from "./auth/tenant-auth";
import { createFeesHandlers } from "./fees/http";
import { createFilesHandlers } from "./files/http";
import { setModules } from "../core/testing/modules";
import * as feeSetup from "./fees/setup";
import * as feeCharges from "./fees/charges";
import { todayInDhaka } from "@/lib/dates";
import { createInstituteHandlers } from "./institute/http";
import { createInstructorHandlers } from "./instructors/http";
import { seedBaselineRoles } from "./rbac/service";
import { createSettingsHandlers } from "./settings/http";
import { createStudentHandlers } from "./students/http";
import * as students from "./students/service";

/**
 * The access matrix (CLAUDE.md "Testing", plan M8): every institute API handler × signed-out × each baseline role ×
 * a single-permission role per permission × a suspended institute × another institute's ids. Paid-module columns
 * join with each module. The catalogue of handlers below must name every handler and every route, or this fails.
 */

const { db: testDb, reset, close } = createTestDb();
const db = testDb as unknown as Db;
const host = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };
const auth = createTenantAuth(db, { secret: "test-secret-".padEnd(40, "x"), host, protocol: "http" });
let storage: LocalDiskStorage;

const DUMMY = "00000000-0000-4000-8000-000000000000";
type Entity = "COURSE" | "SUBJECT" | "BATCH" | "BATCH_SUBJECT" | "SCHEDULE_SLOT" | "STUDENT" | "MEMBERSHIP" | "INSTRUCTOR" | "USER" | "SIGNATURE" | "FILE" | "FEE_ITEM" | "STUDENT_FEE_AMOUNT" | "FEE_RUN" | "FEE_CHARGE";
type Factory = "academic" | "students" | "instructors" | "institute" | "settings" | "files" | "fees";

interface Entry {
  factory: Factory;
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** The permission the guard must demand; "signed-in" for handlers any institute user may call. */
  permission: PermissionName | "signed-in";
  /** The entity a path id names, for the cross-institute column. */
  id?: Entity;
  /** A well-formed body, so a request with another institute's id reaches the id lookup. */
  body?: unknown;
}

const student = {
  full_name: "Matrix Student", gender: "MALE", guardian_name: "G", guardian_relation: "FATHER", guardian_phone: "01711000111", temporary_password: "Student123",
};

const HANDLERS: Entry[] = [
  // academic
  { factory: "academic", name: "listCourses", method: "GET", permission: "academic.view" },
  { factory: "academic", name: "createCourse", method: "POST", permission: "academic.manage", body: { name: "Matrix", code: "MTX" } },
  { factory: "academic", name: "getCourse", method: "GET", permission: "academic.view", id: "COURSE" },
  { factory: "academic", name: "updateCourse", method: "PATCH", permission: "academic.manage", id: "COURSE", body: { name: "Renamed" } },
  { factory: "academic", name: "setCourseStatus", method: "PATCH", permission: "academic.manage", id: "COURSE", body: { status: "ARCHIVED" } },
  { factory: "academic", name: "deleteCourse", method: "DELETE", permission: "academic.manage", id: "COURSE" },
  { factory: "academic", name: "createSubject", method: "POST", permission: "academic.manage", id: "COURSE", body: { name: "Matrix subject" } },
  { factory: "academic", name: "updateSubject", method: "PATCH", permission: "academic.manage", id: "SUBJECT", body: { name: "Renamed" } },
  { factory: "academic", name: "deleteSubject", method: "DELETE", permission: "academic.manage", id: "SUBJECT" },
  { factory: "academic", name: "listBatches", method: "GET", permission: "academic.view" },
  { factory: "academic", name: "createBatch", method: "POST", permission: "academic.manage", id: "COURSE", body: { name: "Matrix batch" } },
  { factory: "academic", name: "getBatch", method: "GET", permission: "academic.view", id: "BATCH" },
  { factory: "academic", name: "updateBatch", method: "PATCH", permission: "academic.manage", id: "BATCH", body: { name: "Renamed" } },
  { factory: "academic", name: "deleteBatch", method: "DELETE", permission: "academic.manage", id: "BATCH" },
  { factory: "academic", name: "addBatchSubject", method: "POST", permission: "academic.manage", id: "BATCH", body: { subject_id: DUMMY } },
  { factory: "academic", name: "removeBatchSubject", method: "DELETE", permission: "academic.manage", id: "BATCH_SUBJECT" },
  { factory: "academic", name: "setInstructors", method: "PUT", permission: "academic.manage", id: "BATCH_SUBJECT", body: { instructor_ids: [] } },
  { factory: "academic", name: "addSlot", method: "POST", permission: "academic.manage", id: "BATCH_SUBJECT", body: { weekday: "FRI", starts_at: "07:00", ends_at: "08:00" } },
  { factory: "academic", name: "removeSlot", method: "DELETE", permission: "academic.manage", id: "SCHEDULE_SLOT" },
  { factory: "academic", name: "assignableInstructors", method: "GET", permission: "academic.manage" },
  // students
  { factory: "students", name: "list", method: "GET", permission: "students.view" },
  { factory: "students", name: "admit", method: "POST", permission: "students.create", body: student },
  { factory: "students", name: "get", method: "GET", permission: "students.view", id: "STUDENT" },
  { factory: "students", name: "update", method: "PATCH", permission: "students.update", id: "STUDENT", body: { school_class: "X" } },
  { factory: "students", name: "setStatus", method: "PATCH", permission: "students.status", id: "STUDENT", body: { status: "ON_HOLD" } },
  { factory: "students", name: "resetPassword", method: "POST", permission: "students.update", id: "STUDENT", body: { temporary_password: "NewPass123" } },
  { factory: "students", name: "addMembership", method: "POST", permission: "students.batches.manage", id: "STUDENT", body: { batch_id: DUMMY } },
  { factory: "students", name: "setRoll", method: "PATCH", permission: "students.batches.manage", id: "MEMBERSHIP", body: { roll_number: "7" } },
  { factory: "students", name: "endMembership", method: "POST", permission: "students.batches.manage", id: "MEMBERSHIP", body: { status: "LEFT" } },
  { factory: "students", name: "batchStudents", method: "GET", permission: "students.view", id: "BATCH" },
  // instructors
  { factory: "instructors", name: "list", method: "GET", permission: "instructors.view" },
  { factory: "instructors", name: "get", method: "GET", permission: "instructors.view", id: "INSTRUCTOR" },
  { factory: "instructors", name: "create", method: "POST", permission: "instructors.manage", body: { full_name: "Matrix Teacher", email: "mt@x.test", temporary_password: "TeachPass1" } },
  { factory: "instructors", name: "update", method: "PATCH", permission: "instructors.manage", id: "INSTRUCTOR", body: { address: "X" } },
  { factory: "instructors", name: "setStatus", method: "PATCH", permission: "instructors.status", id: "INSTRUCTOR", body: { status: "INACTIVE" } },
  { factory: "instructors", name: "resetPassword", method: "POST", permission: "instructors.manage", id: "INSTRUCTOR", body: { temporary_password: "NewPass123" } },
  // institute
  { factory: "institute", name: "listModules", method: "GET", permission: "modules.view" },
  { factory: "institute", name: "requestModule", method: "POST", permission: "modules.view", body: { module_key: "fees" } },
  { factory: "institute", name: "auditLog", method: "GET", permission: "audit.view" },
  { factory: "institute", name: "listRoles", method: "GET", permission: "users.view" },
  { factory: "institute", name: "listUsers", method: "GET", permission: "users.view" },
  { factory: "institute", name: "createUser", method: "POST", permission: "users.manage", body: { name: "Matrix", email: "matrix@x.test", role_ids: [], temporary_password: "SomePass1" } },
  { factory: "institute", name: "setRoles", method: "PUT", permission: "users.manage", id: "USER", body: { role_ids: [] } },
  { factory: "institute", name: "setStatus", method: "PATCH", permission: "users.manage", id: "USER", body: { disabled: true } },
  { factory: "institute", name: "resetPassword", method: "POST", permission: "users.manage", id: "USER", body: { temporary_password: "NewPass123" } },
  // settings
  { factory: "settings", name: "getProfile", method: "GET", permission: "signed-in" },
  { factory: "settings", name: "saveProfile", method: "PUT", permission: "settings.manage", body: { display_name: "Matrix Institute" } },
  { factory: "settings", name: "listSignatures", method: "GET", permission: "settings.manage" },
  { factory: "settings", name: "getStudentIdPattern", method: "GET", permission: "settings.manage" },
  { factory: "settings", name: "saveStudentIdPattern", method: "PUT", permission: "settings.manage", body: { prefix: "MX", include_course_code: false, separator: "-", sequence_width: 4 } },
  { factory: "settings", name: "createSignature", method: "POST", permission: "settings.manage", body: { title: "Principal", person_name: "P" } },
  { factory: "settings", name: "updateSignature", method: "PATCH", permission: "settings.manage", id: "SIGNATURE", body: { title: "Director", person_name: "D" } },
  { factory: "settings", name: "deleteSignature", method: "DELETE", permission: "settings.manage", id: "SIGNATURE" },
  // files: any institute user may call; what they may upload or view is checked per file (canUpload / canViewFile)
  { factory: "files", name: "upload", method: "POST", permission: "signed-in", body: {} },
  { factory: "files", name: "serve", method: "GET", permission: "signed-in", id: "FILE" },
  // fees (paid module): every handler is also refused while the module is off
  { factory: "fees", name: "listItems", method: "GET", permission: "fees.view" },
  { factory: "fees", name: "createItem", method: "POST", permission: "fees.configure", body: { course_id: DUMMY, kind: "MONTHLY", name: "Matrix fee", amount: "100" } },
  { factory: "fees", name: "updateItem", method: "PATCH", permission: "fees.configure", id: "FEE_ITEM", body: { amount: "200" } },
  { factory: "fees", name: "setItemStatus", method: "PATCH", permission: "fees.configure", id: "FEE_ITEM", body: { status: "ARCHIVED" } },
  { factory: "fees", name: "deleteItem", method: "DELETE", permission: "fees.configure", id: "FEE_ITEM" },
  { factory: "fees", name: "studentAmounts", method: "GET", permission: "fees.view", id: "STUDENT" },
  { factory: "fees", name: "setStudentAmount", method: "PUT", permission: "fees.adjust", id: "STUDENT", body: { fee_item_id: DUMMY, amount: "100", reason: "Sibling" } },
  { factory: "fees", name: "removeStudentAmount", method: "DELETE", permission: "fees.adjust", id: "STUDENT_FEE_AMOUNT" },
  { factory: "fees", name: "getSettings", method: "GET", permission: "fees.view" },
  { factory: "fees", name: "saveSettings", method: "PUT", permission: "fees.configure", body: { receipt_prefix: "MX" } },
  { factory: "fees", name: "previewGeneration", method: "POST", permission: "fees.generate", body: { fee_item_id: DUMMY, period: "2026-06" } },
  { factory: "fees", name: "generate", method: "POST", permission: "fees.generate", body: { fee_item_id: DUMMY, period: "2026-06" } },
  { factory: "fees", name: "listRuns", method: "GET", permission: "fees.view" },
  { factory: "fees", name: "cancelRun", method: "POST", permission: "fees.generate", id: "FEE_RUN", body: { reason: "Wrong month" } },
  { factory: "fees", name: "studentCharges", method: "GET", permission: "fees.view", id: "STUDENT" },
  { factory: "fees", name: "addFine", method: "POST", permission: "fees.adjust", id: "STUDENT", body: { amount: "50", reason: "Late" } },
  { factory: "fees", name: "cancelCharge", method: "POST", permission: "fees.generate", id: "FEE_CHARGE", body: { reason: "Wrong" } },
];
/** Handlers deliberately outside the matrix, with the reason. */
const OUTSIDE: Partial<Record<Factory, Record<string, string>>> = { files: { publicLogo: "public by design: the host's logo while its public page is shown (D58)" } };

type Handlers = Record<string, (request: Request, params?: { id: string }) => Promise<Response>>;
let factories: Record<Factory, Handlers>;

const HOST = (sub: string) => `${sub}.localhost:3000`;
function call(entry: Entry, sub: string, cookie: string | null, id = DUMMY) {
  const request = new Request(`http://${HOST(sub)}/api/v1/matrix`, {
    method: entry.method,
    headers: { host: HOST(sub), origin: `http://${HOST(sub)}`, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: entry.method === "GET" || entry.method === "DELETE" ? undefined : JSON.stringify(entry.body ?? {}),
  });
  return factories[entry.factory][entry.name](request, { id });
}
async function outcome(res: Response): Promise<"unauthenticated" | "denied" | "suspended" | "module-off" | "passed"> {
  if (res.status === 401) return "unauthenticated";
  if (res.status !== 403) return "passed";
  const code = ((await res.json()) as { error: { code: string } }).error.code;
  if (code === "PERM_DENIED") return "denied";
  if (code === "TENANT_SUSPENDED") return "suspended";
  if (code === "MODULE_INACTIVE") return "module-off";
  return "passed"; // e.g. PERM_ESCALATION: past the guard, refused by the service
}

async function signIn(sub: string, email: string, password: string) {
  await testDb.delete(rateLimits); // sign-in is rate limited per address; this suite signs in many users
  const res = await auth.handler(
    new Request(`http://${HOST(sub)}/api/auth/tenant/sign-in`, {
      method: "POST",
      headers: { host: HOST(sub), origin: `http://${HOST(sub)}`, "content-type": "application/json" },
      body: JSON.stringify({ identifier: email, password }),
    }),
  );
  expect(res.status).toBe(200);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

const BASELINE = ROLE_TEMPLATES.map((t) => t.name);
const permissionsOf = (role: string): Set<string> | "all" => {
  const t = ROLE_TEMPLATES.find((r) => r.name === role)!;
  return t.grantsAll ? "all" : new Set(t.permissions);
};
const GUARDED = [...new Set(HANDLERS.map((h) => h.permission).filter((p): p is PermissionName => p !== "signed-in"))];

const cookies: Record<string, string> = {};
let a: { id: string; sub: string };
const foreign = {} as Record<Entity, string>;

beforeAll(async () => {
  await reset();
  await seedPlatformCatalog(testDb);
  storage = new LocalDiskStorage(await mkdtemp(path.join(os.tmpdir(), "cms-matrix-")));
  factories = {
    academic: createAcademicHandlers({ db, auth, host }) as unknown as Handlers,
    students: createStudentHandlers({ db, auth, host }) as unknown as Handlers,
    instructors: createInstructorHandlers({ db, auth, host }) as unknown as Handlers,
    institute: createInstituteHandlers({ db, auth, host }) as unknown as Handlers,
    settings: createSettingsHandlers({ db, auth, host }) as unknown as Handlers,
    files: createFilesHandlers({ db, auth, host, storage }) as unknown as Handlers,
    fees: createFeesHandlers({ db, auth, host }) as unknown as Handlers,
  };

  const institute = async (sub: string) => {
    const [tenant] = await testDb.insert(tenants).values({ name: sub, subdomain: sub, status: "ACTIVE" }).returning();
    const roleIds = await seedBaselineRoles(db, tenant.id);
    const owner = await createLogin(db, { tenantId: tenant.id, name: "Owner", email: `owner@${sub}.test`, password: "OwnerPass1", mustChangePassword: false });
    await testDb.insert(userRoles).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[INSTITUTE_OWNER_ROLE] });
    await testDb.update(tenants).set({ ownerUserId: owner.id }).where(eq(tenants.id, tenant.id));
    return { tenant, roleIds, owner };
  };

  // Institute A: one user per baseline role, and one per guarded permission holding only that permission.
  const inst = await institute("matrix-a");
  await setModules(db, inst.tenant.id, ["fees"]);
  a = { id: inst.tenant.id, sub: "matrix-a" };
  const perms = await testDb.select().from(permissionRows);
  for (const role of BASELINE) {
    const email = `${role.toLowerCase()}@matrix-a.test`;
    if (role === INSTITUTE_OWNER_ROLE) {
      cookies[role] = await signIn(a.sub, "owner@matrix-a.test", "OwnerPass1");
      continue;
    }
    const user = await createLogin(db, { tenantId: a.id, name: role, email, password: "SomePass1", mustChangePassword: false });
    await testDb.insert(userRoles).values({ tenantId: a.id, userId: user.id, roleId: inst.roleIds[role] });
    cookies[role] = await signIn(a.sub, email, "SomePass1");
  }
  for (const permission of GUARDED) {
    const [role] = await testDb.insert(roles).values({ tenantId: a.id, name: `Only ${permission}` }).returning();
    await testDb.insert(rolePermissions).values({ tenantId: a.id, roleId: role.id, permissionId: perms.find((p) => p.name === permission)!.id });
    const email = `${permission.replaceAll(".", "-")}@matrix-a.test`;
    const user = await createLogin(db, { tenantId: a.id, name: permission, email, password: "SomePass1", mustChangePassword: false });
    await testDb.insert(userRoles).values({ tenantId: a.id, userId: user.id, roleId: role.id });
    cookies[`only:${permission}`] = await signIn(a.sub, email, "SomePass1");
  }

  // Institute B: one record of every kind a path id can name.
  const b = await institute("matrix-b");
  await setModules(db, b.tenant.id, ["fees"]);
  const actor = { tenantId: b.tenant.id, userId: b.owner.id };
  const course = await academic.createCourse(db, actor, { name: "B course", code: "BC", dueDay: 10 });
  const subject = await academic.createSubject(db, actor, course.id, { name: "B subject" });
  const batch = await academic.createBatch(db, actor, course.id, { name: "B batch" });
  const batchSubject = await academic.addBatchSubject(db, actor, batch.id, subject.id);
  const slot = await academic.addScheduleSlot(db, actor, batchSubject.id, { weekday: "SAT", startsAt: "09:00", endsAt: "10:00" });
  const { student: s } = await students.admitStudent(db, actor, {
    fullName: "B student", gender: "FEMALE", guardianName: "G", guardianRelation: "MOTHER", guardianPhone: "01711000222", batchIds: [batch.id], temporaryPassword: "Student123",
  });
  const [membership] = await testDb.select().from(batchMemberships).where(eq(batchMemberships.studentId, s.id));
  const teacherLogin = await createLogin(db, { tenantId: b.tenant.id, name: "B teacher", email: "t@matrix-b.test", password: "TeachPass1" });
  const [teacher] = await testDb.insert(instructors).values({ tenantId: b.tenant.id, userId: teacherLogin.id, fullName: "B teacher" }).returning();
  const [signature] = await testDb.insert(signatures).values({ tenantId: b.tenant.id, title: "Head", personName: "H" }).returning();
  const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#000" } }).jpeg().toBuffer();
  const file = await uploadFile(db, storage, actor, { category: "LOGO", filename: "b.jpg", bytes });
  const feeItem = await feeSetup.createFeeItem(db, actor, { courseId: course.id, kind: "MONTHLY", name: "B tuition", amount: "1000" });
  const studentAmount = await feeSetup.setStudentFeeAmount(db, actor, s.id, { feeItemId: feeItem.id, amount: "500", reason: "Sibling" });
  const run = await feeCharges.confirmGeneration(db, actor, { feeItemId: feeItem.id, period: todayInDhaka().slice(0, 7) });
  const [charge] = await feeCharges.listStudentCharges(db, b.tenant.id, s.id);
  Object.assign(foreign, {
    COURSE: course.id, SUBJECT: subject.id, BATCH: batch.id, BATCH_SUBJECT: batchSubject.id, SCHEDULE_SLOT: slot.id, STUDENT: s.id, MEMBERSHIP: membership.id,
    INSTRUCTOR: teacher.id, USER: teacherLogin.id, SIGNATURE: signature.id, FILE: file.id, FEE_ITEM: feeItem.id, STUDENT_FEE_AMOUNT: studentAmount.id, FEE_RUN: run.id, FEE_CHARGE: charge.id,
  });
}, 120_000);

afterAll(async () => {
  await close();
});

describe("access matrix: catalogue", () => {
  it("names every handler of every institute HTTP module", () => {
    for (const [factory, handlers] of Object.entries(factories) as [Factory, Handlers][]) {
      const listed = HANDLERS.filter((h) => h.factory === factory).map((h) => h.name);
      const outside = Object.keys(OUTSIDE[factory] ?? {});
      expect([...listed, ...outside].sort(), factory).toEqual(Object.keys(handlers).sort());
    }
  });

  it("covers every institute API route", async () => {
    const root = path.join(process.cwd(), "src/app/api");
    const files: string[] = [];
    const walk = async (dir: string) => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (e.isDirectory()) await walk(path.join(dir, e.name));
        else if (e.name === "route.ts") files.push(path.join(dir, e.name));
      }
    };
    await walk(root);
    const moduleOf: Record<string, Factory> = { academic: "academic", students: "students", instructors: "instructors", institute: "institute", settings: "settings", files: "files", fees: "fees" };
    const seen: string[] = [];
    for (const file of files) {
      const rel = path.relative(root, file).replaceAll("\\", "/");
      // Better Auth's own endpoints and the platform API (guarded by requirePlatformAdmin, tested in platform/http.test.ts) are not institute handlers.
      if (rel.startsWith("auth/") || rel.startsWith("platform/")) continue;
      const source = await readFile(file, "utf8");
      const mod = /@\/server\/modules\/(\w+)\/instance/.exec(source)?.[1];
      expect(mod && moduleOf[mod], `${rel} imports an institute module instance`).toBeTruthy();
      for (const [, name] of source.matchAll(/\bh\.(\w+)\(/g)) {
        const factory = moduleOf[mod!];
        const known = HANDLERS.some((h) => h.factory === factory && h.name === name) || name in (OUTSIDE[factory] ?? {});
        expect(known, `${rel} → ${factory}.${name} is in the matrix`).toBe(true);
        seen.push(`${factory}.${name}`);
      }
    }
    // And every matrix entry is reachable through some route.
    expect(HANDLERS.filter((h) => !seen.includes(`${h.factory}.${h.name}`)).map((h) => `${h.factory}.${h.name}`)).toEqual([]);
  });
});

describe("access matrix: who passes the guard", () => {
  it("refuses every handler to a signed-out request (401)", async () => {
    for (const entry of HANDLERS) {
      expect(await outcome(await call(entry, a.sub, null)), `${entry.factory}.${entry.name}`).toBe("unauthenticated");
    }
  });

  it.each(BASELINE)("lets the %s role through exactly the handlers its permissions cover", async (role) => {
    const held = permissionsOf(role);
    for (const entry of HANDLERS) {
      const allowed = entry.permission === "signed-in" || held === "all" || held.has(entry.permission);
      expect(await outcome(await call(entry, a.sub, cookies[role])), `${role} → ${entry.factory}.${entry.name}`).toBe(allowed ? "passed" : "denied");
    }
  });

  it("demands exactly the declared permission: a role holding only that one passes, every other single-permission role is refused", async () => {
    for (const entry of HANDLERS) {
      for (const permission of GUARDED) {
        const allowed = entry.permission === "signed-in" || entry.permission === permission;
        const got = await outcome(await call(entry, a.sub, cookies[`only:${permission}`]));
        expect(got, `only ${permission} → ${entry.factory}.${entry.name}`).toBe(allowed ? "passed" : "denied");
      }
    }
  }, 120_000);
});

describe("access matrix: paid module switched off", () => {
  it("refuses every handler of a switched-off module, even to the Owner, and leaves Core alone", async () => {
    await setModules(db, a.id, ["fees"], false);
    try {
      for (const entry of HANDLERS) {
        const got = await outcome(await call(entry, a.sub, cookies[INSTITUTE_OWNER_ROLE]));
        expect(got, `${entry.factory}.${entry.name} with fees off`).toBe(entry.factory === "fees" ? "module-off" : "passed");
      }
    } finally {
      await setModules(db, a.id, ["fees"]);
    }
  });
});

describe("access matrix: institute state and other institutes", () => {
  it("answers another institute's ids with 404, never their data", async () => {
    for (const entry of HANDLERS.filter((h) => h.id)) {
      const res = await call(entry, a.sub, cookies[INSTITUTE_OWNER_ROLE], foreign[entry.id!]);
      expect(res.status, `${entry.factory}.${entry.name} with another institute's ${entry.id}`).toBe(404);
    }
  });

  it("allows reads but refuses every change while the institute is suspended", async () => {
    await testDb.update(tenants).set({ status: "SUSPENDED" }).where(eq(tenants.id, a.id));
    try {
      for (const entry of HANDLERS) {
        const got = await outcome(await call(entry, a.sub, cookies[INSTITUTE_OWNER_ROLE]));
        expect(got, `${entry.method} ${entry.factory}.${entry.name}`).toBe(entry.method === "GET" ? "passed" : "suspended");
      }
    } finally {
      await testDb.update(tenants).set({ status: "ACTIVE" }).where(eq(tenants.id, a.id));
    }
  });
});
