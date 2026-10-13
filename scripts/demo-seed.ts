import "dotenv/config";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import sharp from "sharp";
import * as schema from "../src/server/core/db/schema";
import type { Db } from "../src/server/core/db/types";
import { uploadFile } from "../src/server/core/files/service";
import { storageFromEnv } from "../src/server/core/files/storage";
import { PERMISSION_CATALOG } from "../src/server/core/rbac/catalog";
import { addDays, todayInDhaka, weekdayOf } from "../src/lib/dates";
import * as academic from "../src/server/modules/academic/service";
import * as registers from "../src/server/modules/attendance/registers";
import * as leave from "../src/server/modules/attendance/leave";
import * as examSetup from "../src/server/modules/exams/setup";
import * as marks from "../src/server/modules/exams/marks";
import * as results from "../src/server/modules/exams/results";
import * as feeSetup from "../src/server/modules/fees/setup";
import * as feeCharges from "../src/server/modules/fees/charges";
import * as feePayments from "../src/server/modules/fees/payments";
import { listRoles, createStaffUser } from "../src/server/modules/institute/users";
import { createInstructor } from "../src/server/modules/instructors/service";
import { createTenant } from "../src/server/modules/platform/service";
import * as routine from "../src/server/modules/routine/service";
import * as lessons from "../src/server/modules/routine/lessons";
import { saveInstitutionProfile } from "../src/server/modules/settings/service";
import { admitStudent } from "../src/server/modules/students/service";
import * as websiteContent from "../src/server/modules/website/content";
import * as enquiries from "../src/server/modules/website/enquiries";
import { DEFAULT_DESIGN, THEME_PRESETS } from "../src/server/modules/website/design";
import { DEFAULT_SECTIONS, saveWebsiteSettings } from "../src/server/modules/website/settings";

// npm run demo:seed [-- --subdomain=demo]
//
// Builds a realistic demo institute in the LOCAL development database through the real services, for the owner's
// walkthrough (docs/manual/OWNER-WALKTHROUGH.md, D134): courses, batches, instructors, students, fees, attendance,
// leave, an exam with published results, routine changes, lesson plans, and a filled-in website with enquiries.
// Demo passwords are printed at the end; they are for local demo data only. Refuses to run in production.

const PASSWORD = "DemoPass123";
const subdomain = process.argv.find((a) => a.startsWith("--subdomain="))?.split("=")[1] ?? "demo";

async function picture(label: string, from: string, to: string, width = 1600, height = 900) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${width * 0.82}" cy="${height * 0.25}" r="${height * 0.32}" fill="#ffffff" fill-opacity="0.08"/>
    <circle cx="${width * 0.12}" cy="${height * 0.9}" r="${height * 0.4}" fill="#ffffff" fill-opacity="0.06"/>
    <text x="50%" y="54%" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.round(height / 9)}" font-weight="700" fill="#ffffff" fill-opacity="0.9">${label}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("demo:seed refuses to run in production.");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema }) as unknown as Db;
  const storage = storageFromEnv();
  try {
    const [admin] = await db.select({ id: schema.platformUsers.id }).from(schema.platformUsers).limit(1);
    if (!admin) throw new Error("No Super Admin yet: run `npm run platform:create-admin` first.");
    const [existing] = await db.select({ id: schema.tenants.id }).from(schema.tenants).where(eq(schema.tenants.subdomain, subdomain));
    if (existing) throw new Error(`An institute with subdomain "${subdomain}" already exists. Use --subdomain=another-name.`);

    const ownerEmail = `owner@${subdomain}.test`;
    await createTenant(
      db,
      { name: "Alo Coaching Centre", subdomain, starterModuleKeys: ["attendance", "routine", "exams", "fees", "website"], ownerName: "Farhana Akter", ownerEmail, temporaryPassword: PASSWORD },
      { platformUserId: admin.id },
    );
    const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.subdomain, subdomain));
    const tenantId = tenant.id;
    const actor = { tenantId, userId: tenant.ownerUserId! };
    // The Owner holds every permission; the seed acts as the Owner.
    const owner = { ...actor, permissions: new Set<string>(PERMISSION_CATALOG.map((p) => p.name)) };
    const noFirstChange = (email: string) => db.execute(sql`update users set must_change_password = false where tenant_id = ${tenantId} and email = ${email}`);
    await noFirstChange(ownerEmail);
    const today = todayInDhaka();

    await saveInstitutionProfile(db, actor, {
      displayName: "Alo Coaching Centre", shortName: "Alo Coaching", address: "House 24, Road 7, Mirpur 10, Dhaka 1216", phone: "01711-555666",
      email: "info@alocoaching.test", website: null, institutionCode: null, logoFileId: null, primaryColor: "#0f766e", secondaryColor: null,
    });

    // --- Teaching -------------------------------------------------------------------------------------------
    const teachers = [];
    for (const [fullName, email] of [["Mahmudul Hasan", "mahmud"], ["Sharmin Sultana", "sharmin"], ["Rezaul Karim", "rezaul"]]) {
      const { instructor } = await createInstructor(db, actor, { fullName, email: `${email}@${subdomain}.test`, temporaryPassword: PASSWORD });
      await noFirstChange(`${email}@${subdomain}.test`);
      teachers.push(instructor);
    }
    const [mahmud, sharmin, rezaul] = teachers;

    const ssc = await academic.createCourse(db, actor, { name: "SSC Science 2026", code: "SSC26", dueDay: 10, description: "Full SSC preparation: Physics, Chemistry and Higher Math, with weekly tests." });
    const hsc = await academic.createCourse(db, actor, { name: "HSC Science 2027", code: "HSC27", dueDay: 10, description: "First-year HSC science with board-style model tests." });
    const subj = async (courseId: string, names: string[]) => Promise.all(names.map((name) => academic.createSubject(db, actor, courseId, { name })));
    const [sPhy, sChem, sMath] = await subj(ssc.id, ["Physics", "Chemistry", "Higher Math"]);
    const [hPhy, hChem, hBio] = await subj(hsc.id, ["Physics", "Chemistry", "Biology"]);
    const days = academic.WEEKDAYS.filter((d) => d !== "FRI");
    const batch = async (courseId: string, name: string, plan: [string, string, string, string][]) => {
      const b = await academic.createBatch(db, actor, courseId, { name });
      const out: Record<string, { id: string; startsAt: string }> = {};
      for (const [subjectId, instructorId, startsAt, endsAt] of plan) {
        const bs = await academic.addBatchSubject(db, actor, b.id, subjectId);
        await academic.setBatchSubjectInstructors(db, actor, bs.id, [instructorId]);
        for (const weekday of days) await academic.addScheduleSlot(db, actor, bs.id, { weekday, startsAt, endsAt });
        out[subjectId] = { id: bs.id, startsAt };
      }
      return { ...b, subjects: out };
    };
    const sscMorning = await batch(ssc.id, "Morning", [[sPhy.id, mahmud.id, "08:00", "09:00"], [sChem.id, sharmin.id, "09:15", "10:15"], [sMath.id, rezaul.id, "10:30", "11:30"]]);
    const sscEvening = await batch(ssc.id, "Evening", [[sPhy.id, mahmud.id, "16:00", "17:00"], [sChem.id, sharmin.id, "17:15", "18:15"], [sMath.id, rezaul.id, "18:30", "19:30"]]);
    const hscEvening = await batch(hsc.id, "Evening", [[hPhy.id, mahmud.id, "14:00", "15:00"], [hChem.id, sharmin.id, "12:00", "13:00"], [hBio.id, rezaul.id, "15:00", "16:00"]]);

    // --- Students -------------------------------------------------------------------------------------------
    const admissionDate = addDays(today, -75);
    const people: [string, "FEMALE" | "MALE", string, typeof sscMorning][] = [
      ["Nusrat Jahan", "FEMALE", "Abdul Karim", sscMorning], ["Tanvir Ahmed", "MALE", "Shahidul Ahmed", sscMorning], ["Anika Rahman", "FEMALE", "Rokeya Rahman", sscMorning],
      ["Fahim Hossain", "MALE", "Delwar Hossain", sscMorning], ["Sadia Islam", "FEMALE", "Nazrul Islam", sscMorning],
      ["Rafi Chowdhury", "MALE", "Mizanur Chowdhury", sscEvening], ["Mim Akter", "FEMALE", "Selina Akter", sscEvening], ["Arif Billah", "MALE", "Mostafa Billah", sscEvening],
      ["Labiba Haque", "FEMALE", "Enamul Haque", hscEvening], ["Siam Mahmud", "MALE", "Kamrul Mahmud", hscEvening], ["Tasnim Ferdous", "FEMALE", "Ferdousi Begum", hscEvening], ["Zarif Kabir", "MALE", "Humayun Kabir", hscEvening],
    ];
    const admitted = [];
    for (const [i, [fullName, gender, guardianName, b]] of people.entries()) {
      const { student } = await admitStudent(db, actor, {
        fullName, gender, guardianName, guardianRelation: gender === "FEMALE" && i % 3 === 2 ? "MOTHER" : "FATHER", guardianPhone: `0171${String(1000000 + i * 7919).slice(0, 7)}`,
        admissionDate, courseId: b === hscEvening ? hsc.id : ssc.id, batchIds: [b.id], temporaryPassword: PASSWORD,
      });
      await db.execute(sql`update users set must_change_password = false where tenant_id = ${tenantId} and id = ${student.userId}`);
      admitted.push({ ...student, batch: b });
    }

    // An Accountant for the fee counter.
    const roles = await listRoles(db, tenantId);
    const accountantRole = roles.find((r) => r.name === "Accountant");
    if (accountantRole) {
      await createStaffUser(db, actor, { name: "Jamal Uddin", email: `accounts@${subdomain}.test`, roleIds: [accountantRole.id], temporaryPassword: PASSWORD });
      await noFirstChange(`accounts@${subdomain}.test`);
    }

    // --- Fees: this month's tuition, most of it collected -----------------------------------------------------
    const sscFee = await feeSetup.createFeeItem(db, actor, { courseId: ssc.id, kind: "MONTHLY", name: "Monthly tuition", amount: "2500" });
    const hscFee = await feeSetup.createFeeItem(db, actor, { courseId: hsc.id, kind: "MONTHLY", name: "Monthly tuition", amount: "3000" });
    await feeSetup.createFeeItem(db, actor, { courseId: ssc.id, kind: "ONE_TIME", name: "Admission fee", amount: "1000" });
    const period = today.slice(0, 7);
    await feeCharges.confirmGeneration(db, actor, { feeItemId: sscFee.id, period });
    await feeCharges.confirmGeneration(db, actor, { feeItemId: hscFee.id, period });
    for (const [i, s] of admitted.entries()) {
      if (i % 4 === 3) continue; // a few still owe this month
      const charges = await feeCharges.listStudentCharges(db, tenantId, s.id);
      await feePayments.collectPayment(db, owner, s.id, { chargeIds: charges.map((c) => c.id), method: i % 2 ? "BKASH" : "CASH", reference: i % 2 ? `TX${8800 + i}` : null, idempotencyKey: randomUUID() });
    }

    // --- Attendance: the last few class days of SSC Morning ---------------------------------------------------
    const classDays: string[] = [];
    for (let d = addDays(today, -1); classDays.length < 4; d = addDays(d, -1)) if (weekdayOf(d) !== "FRI") classDays.push(d);
    const morningStudents = admitted.filter((s) => s.batch === sscMorning);
    for (const [di, date] of classDays.entries()) {
      for (const bs of Object.values(sscMorning.subjects)) {
        await registers.saveRegister(db, owner, {
          batchSubjectId: bs.id, date, startsAt: bs.startsAt, reason: "Demo data",
          marks: morningStudents.map((s, si) => ({ studentId: s.id, status: (si + di) % 7 === 0 ? "ABSENT" : (si + di) % 5 === 0 ? "LATE" : "PRESENT" })),
        });
      }
    }
    // A leave request waiting for a decision.
    await leave.applyForLeave(db, { tenantId, userId: morningStudents[1].userId! }, { fromDate: addDays(today, 2), toDate: addDays(today, 3), reason: "Cousin's wedding in Cumilla" });

    // --- Exams: last week's test published; a model test coming up ---------------------------------------------
    const weekly = await examSetup.createExam(db, owner, {
      courseId: ssc.id, name: "Weekly Test 3", kind: "WEEKLY", startsOn: addDays(today, -8), endsOn: addDays(today, -8), batchIds: [sscMorning.id, sscEvening.id],
      papers: [{ subjectId: sPhy.id, fullMarks: "50", passMarks: "17" }, { subjectId: sChem.id, fullMarks: "50", passMarks: "17" }],
    });
    const sscStudents = admitted.filter((s) => s.batch !== hscEvening);
    for (const [pi, paper] of weekly.papers.entries()) {
      await marks.saveMarks(db, owner, paper.id, {
        entries: sscStudents.map((s, si) => (si === 6 && pi === 1 ? { studentId: s.id, absent: true } : { studentId: s.id, obtained: String(Math.min(50, 22 + ((si * 7 + pi * 11) % 28))) })),
      });
    }
    await results.publishExam(db, owner, weekly.id);
    await examSetup.createExam(db, owner, {
      courseId: hsc.id, name: "Model Test 1", kind: "MODEL", startsOn: addDays(today, 12), endsOn: addDays(today, 13), batchIds: [hscEvening.id],
      papers: [{ subjectId: hPhy.id, fullMarks: "100", passMarks: "33" }, { subjectId: hChem.id, fullMarks: "100", passMarks: "33" }, { subjectId: hBio.id, fullMarks: "100", passMarks: "33" }],
    });

    // --- Routine: a cancellation, a substitute, a holiday; lesson plans ------------------------------------------
    let next = addDays(today, 1);
    while (weekdayOf(next) === "FRI") next = addDays(next, 1);
    let after = addDays(next, 1);
    while (weekdayOf(after) === "FRI") after = addDays(after, 1);
    await routine.createChange(db, owner, { batchSubjectId: sscEvening.subjects[sMath.id].id, classDate: next, startsAt: "18:30", kind: "CANCEL", reason: "Instructor at a board meeting" });
    await routine.createChange(db, owner, { batchSubjectId: hscEvening.subjects[hBio.id].id, classDate: after, startsAt: "15:00", kind: "SUBSTITUTE", substituteInstructorId: sharmin.id });
    await routine.createHoliday(db, owner, { name: "Institute picnic", fromDate: addDays(today, 9) });
    const plan: [string, number, number, "COMPLETED" | "ONGOING" | "PENDING"][] = [
      ["Ch 1: Physical quantities", -40, -30, "COMPLETED"], ["Ch 2: Motion", -28, -18, "COMPLETED"], ["Ch 3: Force", -16, -4, "ONGOING"], ["Ch 4: Work, power and energy", -2, 10, "PENDING"], ["Ch 5: State of matter and pressure", 12, 24, "PENDING"],
    ];
    for (const bs of [sscMorning.subjects[sPhy.id].id, sscEvening.subjects[sPhy.id].id]) {
      for (const [title, start, target, status] of plan) {
        const topic = await lessons.addTopic(db, owner, bs, { title, startDate: addDays(today, start), targetDate: addDays(today, target) });
        if (status !== "PENDING") await lessons.updateTopic(db, owner, topic.id, { status });
      }
    }

    // --- Website ---------------------------------------------------------------------------------------------
    const upload = async (label: string, from: string, to: string, w?: number, h?: number) =>
      (await uploadFile(db, storage, actor, { category: "WEBSITE_IMAGE", filename: `${label}.jpg`, bytes: await picture(label, from, to, w, h) })).id;
    await saveWebsiteSettings(db, actor, {
      theme: "MODERN", headingFont: "POPPINS", design: { ...DEFAULT_DESIGN, ...THEME_PRESETS.MODERN, palette: "PADMA" }, sections: DEFAULT_SECTIONS, heroHeading: "Bright results start here", heroSubheading: "SSC and HSC science coaching in Mirpur, with small batches and weekly tests.",
      heroImageFileId: await upload("Alo Coaching", "#0f766e", "#155e75"), heroButton: "ENQUIRE", aboutHeading: null,
      aboutText: "Since 2012 we have helped Mirpur's students prepare for their SSC and HSC science exams.\n\nEvery batch has at most 25 students, a weekly test, and teachers who know each student by name.",
      aboutImageFileId: await upload("Our classroom", "#1e3a8a", "#0f766e", 1200, 900),
    });
    await websiteContent.createNotice(db, actor, { title: "Admission open for HSC 2027", body: "Admission for the HSC 2027 science batch is open. Visit the office from 10 am to 7 pm with the SSC result and two photos.", pinned: true });
    await websiteContent.createNotice(db, actor, { title: "Weekly Test 3 results published", body: "Students can see their marks in the student portal.", noticeDate: addDays(today, -6) });
    await websiteContent.createNotice(db, actor, { title: "Institute picnic", body: `No classes on ${new Date(`${addDays(today, 9)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}: the whole institute goes on a picnic.`, noticeDate: addDays(today, -2), showUntil: addDays(today, 9) });
    for (const [label, from, to, caption] of [
      ["Prize-giving", "#b45309", "#be123c", "Prize-giving 2025"], ["Science fair", "#1d4ed8", "#7c3aed", "Science fair"], ["Model test", "#0f766e", "#15803d", "Model test day"], ["Picnic", "#c2410c", "#ca8a04", "Annual picnic"],
    ] as const) {
      await websiteContent.addGalleryPhoto(db, actor, { fileId: await upload(label, from, to, 1200, 1200), caption });
    }
    await websiteContent.createTestimonial(db, actor, { quote: "The weekly tests showed me exactly where I was weak. I got GPA 5 in SSC.", name: "Nabila Sultana", line: "SSC 2025, GPA 5" });
    await websiteContent.createTestimonial(db, actor, { quote: "Teachers call us when our son misses class. That care made the difference.", name: "Kamrul Hasan", line: "Guardian" });
    await websiteContent.createTestimonial(db, actor, { quote: "Small batches meant I could ask every question I had.", name: "Rifat Hossain", line: "HSC 2025, GPA 5" });

    for (const [name, mobile, courseId, message] of [
      ["Shuvo Rahman", "01819223344", hsc.id, "Is there an evening batch for HSC?"], ["Maliha Tasnim", "01612445566", ssc.id, "What is the monthly fee?"], ["Imran Khan", "01915667788", null, null],
    ] as const) {
      await enquiries.submitEnquiry(db, tenantId, { name, mobile, courseId, message }, { ipAddress: null });
    }
    const { items } = await enquiries.listEnquiries(db, tenantId);
    const maliha = items.find((e) => e.name === "Maliha Tasnim")!;
    await enquiries.updateEnquiry(db, actor, maliha.id, { status: "CONTACTED", note: "Called; she will visit on Saturday with her father." });

    const studentLogin = admitted[0].studentCode;
    const owing = admitted.filter((_, i) => i % 4 === 3).length;
    console.log(`
Demo institute "Alo Coaching Centre" is ready: http://${subdomain}.localhost:3000
  Website:      http://${subdomain}.localhost:3000/
  Sign in:      http://${subdomain}.localhost:3000/login
  Owner:        ${ownerEmail}
  Instructor:   mahmud@${subdomain}.test   (teaches Physics)
  Accountant:   accounts@${subdomain}.test
  Student:      ${studentLogin}   (Nusrat Jahan, SSC Morning)
  Password for all of them: ${PASSWORD}   (local demo data only)
  ${admitted.length} students, 3 batches, ${owing} students still owing this month, 1 published exam, 3 enquiries.
Walkthrough: docs/manual/OWNER-WALKTHROUGH.md`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
