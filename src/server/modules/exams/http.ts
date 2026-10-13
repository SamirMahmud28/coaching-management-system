import { z } from "zod";
import type { Db } from "../../core/db/types";
import { handle, json, parseBody, parseQuery, pathId } from "../../core/http/respond";
import type { PermissionName } from "../../core/rbac/catalog";
import type { HostConfig } from "../../core/tenancy/host";
import type { TenantAuth } from "../auth/tenant-auth";
import { withAuthorization } from "../authorization/service";
import * as grading from "./grading";
import * as markEntry from "./marks";
import * as results from "./results";
import * as setup from "./setup";

export interface ExamsHttpDeps {
  db: Db;
  auth: TenantAuth;
  host: HostConfig;
}

// Marks travel as strings ("33.5"), like money, so decimals are never floats.
const marks = z.string().max(9);
const part = z.object({ name: z.string().max(40), full_marks: marks, pass_marks: marks.nullable().optional() });
const paper = z.object({ subject_id: z.uuid(), full_marks: marks, pass_marks: marks, optional: z.boolean().optional(), parts: z.array(part).max(6).optional() });
const examFields = {
  name: z.string().max(120),
  kind: z.enum(setup.EXAM_KINDS),
  starts_on: z.string().max(10),
  ends_on: z.string().max(10),
  syllabus: z.string().max(5000).nullable().optional(),
  show_grades: z.boolean().optional(),
  batch_ids: z.array(z.uuid()).max(50),
  papers: z.array(paper).max(30),
};
const createBody = z.object({ course_id: z.uuid(), ...examFields });
const updateBody = z.object(examFields);
const listQuery = z.object({ course_id: z.uuid().optional(), state: z.enum(["DRAFT", "PUBLISHED"]).optional() });
const markEntryBody = z.object({
  student_id: z.uuid(),
  clear: z.boolean().optional(),
  absent: z.boolean().optional(),
  obtained: marks.nullable().optional(),
  parts: z.array(z.object({ part_id: z.uuid(), obtained: marks })).max(6).optional(),
});
const marksBody = z.object({ entries: z.array(markEntryBody).max(1000), reason: z.string().max(300).nullable().optional() });
const resultsQuery = z.object({ batch_id: z.uuid().optional() });
const scaleBody = z.object({ bands: z.array(z.object({ grade: z.string().max(5), min_percent: z.number(), grade_point: z.number() })).max(15) });

const toInput = (b: z.infer<typeof updateBody>) => ({
  name: b.name, kind: b.kind, startsOn: b.starts_on, endsOn: b.ends_on, syllabus: b.syllabus, showGrades: b.show_grades, batchIds: b.batch_ids,
  papers: b.papers.map((p) => ({
    subjectId: p.subject_id, fullMarks: p.full_marks, passMarks: p.pass_marks, optional: p.optional,
    parts: p.parts?.map((x) => ({ name: x.name, fullMarks: x.full_marks, passMarks: x.pass_marks })),
  })),
});

export function createExamsHandlers({ db, auth, host }: ExamsHttpDeps) {
  const authorize = async (request: Request, permission: PermissionName) => {
    const ctx = await withAuthorization({ db, auth, headers: request.headers, host, method: request.method, permission });
    return { tenantId: ctx.tenant.id, userId: ctx.userId, permissions: ctx.permissions };
  };
  const noContent = () => new Response(null, { status: 204 });

  return {
    // GET /api/v1/exams/options — courses with their active subjects and batches, for the exam form
    setupOptions: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "exams.manage");
        return json(await setup.setupOptions(db, actor.tenantId));
      }),

    // GET /api/v1/exams?course_id=&state=
    listExams: (request: Request) =>
      handle(async () => {
        const viewer = await authorize(request, "exams.view");
        const q = parseQuery(request, listQuery);
        return json(await setup.listExams(db, viewer, { courseId: q.course_id, state: q.state }));
      }),

    // POST /api/v1/exams
    createExam: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "exams.manage");
        const b = await parseBody(request, createBody);
        return json(await setup.createExam(db, actor, { courseId: b.course_id, ...toInput(b) }), 201);
      }),

    // GET /api/v1/exams/:id
    getExam: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "exams.view");
        return json(await setup.getExam(db, viewer, pathId(params.id, "EXAM")));
      }),

    // PUT /api/v1/exams/:id — the whole exam form
    updateExam: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "exams.manage");
        const b = await parseBody(request, updateBody);
        return json(await setup.updateExam(db, actor, pathId(params.id, "EXAM"), toInput(b)));
      }),

    // DELETE /api/v1/exams/:id
    deleteExam: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "exams.manage");
        await setup.deleteExam(db, actor, pathId(params.id, "EXAM"));
        return noContent();
      }),

    // GET /api/v1/exams/grade-scale
    getGradeScale: (request: Request) =>
      handle(async () => {
        const viewer = await authorize(request, "exams.view");
        return json(await grading.getGradeScale(db, viewer.tenantId));
      }),

    // PUT /api/v1/exams/grade-scale
    saveGradeScale: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "exams.manage");
        const b = await parseBody(request, scaleBody);
        return json(await grading.saveGradeScale(db, actor, b.bands.map((x) => ({ grade: x.grade, minPercent: x.min_percent, gradePoint: x.grade_point }))));
      }),

    // GET /api/v1/exam-papers/:id/marks — the roster with each student's mark (D24 scope)
    getRoster: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "exams.view");
        return json(await markEntry.getRoster(db, viewer, pathId(params.id, "EXAM_PAPER")));
      }),

    // PUT /api/v1/exam-papers/:id/marks — after publishing, Owner/Admin only, with a reason (D107)
    saveMarks: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "exams.marks.enter");
        const b = await parseBody(request, marksBody);
        return json(
          await markEntry.saveMarks(db, viewer, pathId(params.id, "EXAM_PAPER"), {
            reason: b.reason,
            entries: b.entries.map((e) => ({ studentId: e.student_id, clear: e.clear, absent: e.absent, obtained: e.obtained, parts: e.parts?.map((p) => ({ partId: p.part_id, obtained: p.obtained })) })),
          }),
        );
      }),

    // GET /api/v1/exams/:id/results?batch_id= — the combined merit list, scoped to the viewer (D24, D109)
    getResults: (request: Request, params: { id: string }) =>
      handle(async () => {
        const viewer = await authorize(request, "exams.view");
        const q = parseQuery(request, resultsQuery);
        return json(await results.getResults(db, viewer, pathId(params.id, "EXAM"), { batchId: q.batch_id }));
      }),

    // POST /api/v1/exams/:id/publish — the whole exam, once every mark is in (D110, D113)
    publishExam: (request: Request, params: { id: string }) =>
      handle(async () => {
        const actor = await authorize(request, "exams.publish");
        return json(await results.publishExam(db, actor, pathId(params.id, "EXAM")));
      }),

    // DELETE /api/v1/exams/grade-scale — back to the BD 5.0 default
    resetGradeScale: (request: Request) =>
      handle(async () => {
        const actor = await authorize(request, "exams.manage");
        return json(await grading.resetGradeScale(db, actor));
      }),
  };
}
