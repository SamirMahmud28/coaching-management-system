import { apiFetch } from "@/lib/api-client";
import type { AuditLogRow } from "@/components/shared/audit-log-table";
import type { ModuleKey } from "@/server/core/modules/registry";

// Wire types, snake_case as the server sends them.

const auth = "/api/auth";

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface InstituteModuleStatus {
  key: ModuleKey;
  name: string;
  always_on: boolean;
  depends_on: ModuleKey[];
  enabled: boolean;
  pending_request: boolean;
}

export interface RoleRow {
  id: string;
  name: string;
  is_system: boolean;
  permissions: string[];
}

export interface UserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  username: string | null;
  banned: boolean;
  must_change_password: boolean;
  created_at: string;
  is_owner: boolean;
  roles: { id: string; name: string }[];
}

export interface InstitutionProfileRow {
  display_name: string;
  short_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  institution_code: string | null;
  logo_file_id: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  is_default: boolean;
}

export interface SignatureRow {
  id: string;
  title: string;
  person_name: string;
  signature_file_id: string | null;
  sort_order: number;
}

export interface StudentIdPatternRow {
  prefix: string;
  include_course_code: boolean;
  separator: "-" | "/" | "";
  sequence_width: number;
  example: string;
  is_default: boolean;
}

export const instituteApi = {
  // Better Auth endpoints take camelCase bodies.
  signIn: (identifier: string, password: string) =>
    apiFetch<{ user: { id: string; name: string; mustChangePassword: boolean } }>(`${auth}/tenant/sign-in`, { body: { identifier, password } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ success: boolean }>(`${auth}/tenant/change-password`, { body: { currentPassword, newPassword } }),
  signOut: () => apiFetch<unknown>(`${auth}/sign-out`, { body: {} }),

  listModules: () => apiFetch<{ items: InstituteModuleStatus[] }>("/api/v1/modules"),
  requestModule: (moduleKey: ModuleKey, note?: string) => apiFetch<unknown>("/api/v1/module-requests", { body: { module_key: moduleKey, note } }),
  auditLog: (q: { page?: number; page_size?: number }) => apiFetch<Paginated<AuditLogRow>>("/api/v1/audit-log", { query: q }),

  listRoles: () => apiFetch<{ items: RoleRow[] }>("/api/v1/roles"),
  listUsers: () => apiFetch<{ items: UserRow[] }>("/api/v1/users"),
  createUser: (body: { name: string; email: string | null; phone: string | null; role_ids: string[]; temporary_password: string }) =>
    apiFetch<{ user: { id: string; name: string }; temporary_password: string }>("/api/v1/users", { body }),
  setUserRoles: (id: string, roleIds: string[]) => apiFetch<void>(`/api/v1/users/${id}/roles`, { method: "PUT", body: { role_ids: roleIds } }),
  setUserDisabled: (id: string, disabled: boolean) => apiFetch<{ id: string; banned: boolean }>(`/api/v1/users/${id}/status`, { method: "PATCH", body: { disabled } }),
  resetUserPassword: (id: string, temporaryPassword: string) =>
    apiFetch<{ temporary_password: string }>(`/api/v1/users/${id}/reset-password`, { body: { temporary_password: temporaryPassword } }),
};

export const settingsApi = {
  profile: () => apiFetch<InstitutionProfileRow>("/api/v1/settings/institution"),
  saveProfile: (body: Omit<InstitutionProfileRow, "is_default">) => apiFetch<InstitutionProfileRow>("/api/v1/settings/institution", { method: "PUT", body }),
  signatures: () => apiFetch<{ items: SignatureRow[] }>("/api/v1/settings/signatures"),
  createSignature: (body: { title: string; person_name: string; signature_file_id: string | null; sort_order?: number }) =>
    apiFetch<SignatureRow>("/api/v1/settings/signatures", { method: "POST", body }),
  updateSignature: (id: string, body: Partial<{ title: string; person_name: string; signature_file_id: string | null; sort_order: number }>) =>
    apiFetch<SignatureRow>(`/api/v1/settings/signatures/${id}`, { method: "PATCH", body }),
  deleteSignature: (id: string) => apiFetch<void>(`/api/v1/settings/signatures/${id}`, { method: "DELETE" }),
  studentIdPattern: () => apiFetch<StudentIdPatternRow>("/api/v1/settings/student-id"),
  saveStudentIdPattern: (body: Omit<StudentIdPatternRow, "example" | "is_default">) =>
    apiFetch<StudentIdPatternRow>("/api/v1/settings/student-id", { method: "PUT", body }),
};

export type InstructorStatus = "ACTIVE" | "INACTIVE";
export type Gender = "MALE" | "FEMALE" | "OTHER";

export interface InstructorRow {
  id: string;
  user_id: string;
  full_name: string;
  gender: Gender | null;
  address: string | null;
  photo_file_id: string | null;
  status: InstructorStatus;
  created_at: string;
  email: string | null;
  phone: string | null;
  must_change_password: boolean;
}

export interface InstructorFields {
  full_name: string;
  email: string | null;
  phone: string | null;
  gender: Gender | null;
  address: string | null;
}

export const instructorsApi = {
  list: (q: { q?: string; status?: InstructorStatus; page?: number; page_size?: number }) =>
    apiFetch<Paginated<InstructorRow>>("/api/v1/instructors", { query: q }),
  get: (id: string) => apiFetch<InstructorRow>(`/api/v1/instructors/${id}`),
  create: (body: InstructorFields & { temporary_password: string }) =>
    apiFetch<{ instructor: InstructorRow; temporary_password: string }>("/api/v1/instructors", { body }),
  update: (id: string, body: Partial<InstructorFields>) => apiFetch<InstructorRow>(`/api/v1/instructors/${id}`, { method: "PATCH", body }),
  setStatus: (id: string, status: InstructorStatus) => apiFetch<InstructorRow>(`/api/v1/instructors/${id}/status`, { method: "PATCH", body: { status } }),
  resetPassword: (id: string, temporaryPassword: string) =>
    apiFetch<{ temporary_password: string }>(`/api/v1/instructors/${id}/reset-password`, { body: { temporary_password: temporaryPassword } }),
};

export type AcademicStatus = "ACTIVE" | "ARCHIVED";
export const WEEKDAYS = ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface CourseFields {
  name: string;
  code: string;
  description: string | null;
  due_day: number | null;
}

export interface CourseRow extends CourseFields {
  id: string;
  status: AcademicStatus;
  subject_count: number;
  batch_count: number;
}

export interface SubjectRow {
  id: string;
  course_id: string;
  name: string;
  status: AcademicStatus;
}

export interface CourseDetail extends CourseFields {
  id: string;
  status: AcademicStatus;
  subjects: SubjectRow[];
  batches: { id: string; name: string; status: AcademicStatus; subject_count: number }[];
}

export interface ScheduleSlotRow {
  id: string;
  weekday: Weekday;
  starts_at: string;
  ends_at: string;
}

export interface BatchSubjectRow {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_status: AcademicStatus;
  instructors: { id: string; full_name: string; status: InstructorStatus }[];
  slots: ScheduleSlotRow[];
}

export interface BatchDetail {
  id: string;
  name: string;
  status: AcademicStatus;
  course_id: string;
  course: { id: string; name: string; code: string; status: AcademicStatus };
  subjects: BatchSubjectRow[];
}


type NameAndStatus = { name?: string; status?: AcademicStatus };

export const academicApi = {
  courses: (q: { status?: AcademicStatus } = {}) => apiFetch<CourseRow[]>("/api/v1/courses", { query: q }),
  course: (id: string) => apiFetch<CourseDetail>(`/api/v1/courses/${id}`),
  createCourse: (body: CourseFields) => apiFetch<CourseRow>("/api/v1/courses", { body }),
  updateCourse: (id: string, body: Partial<CourseFields>) => apiFetch<CourseRow>(`/api/v1/courses/${id}`, { method: "PATCH", body }),
  setCourseStatus: (id: string, status: AcademicStatus) => apiFetch<CourseRow>(`/api/v1/courses/${id}/status`, { method: "PATCH", body: { status } }),
  deleteCourse: (id: string) => apiFetch<void>(`/api/v1/courses/${id}`, { method: "DELETE" }),
  createSubject: (courseId: string, name: string) => apiFetch<SubjectRow>(`/api/v1/courses/${courseId}/subjects`, { body: { name } }),
  updateSubject: (id: string, body: NameAndStatus) => apiFetch<SubjectRow>(`/api/v1/subjects/${id}`, { method: "PATCH", body }),
  deleteSubject: (id: string) => apiFetch<void>(`/api/v1/subjects/${id}`, { method: "DELETE" }),
  createBatch: (courseId: string, name: string) => apiFetch<{ id: string }>(`/api/v1/courses/${courseId}/batches`, { body: { name } }),
  batch: (id: string) => apiFetch<BatchDetail>(`/api/v1/batches/${id}`),
  updateBatch: (id: string, body: NameAndStatus) => apiFetch<unknown>(`/api/v1/batches/${id}`, { method: "PATCH", body }),
  deleteBatch: (id: string) => apiFetch<void>(`/api/v1/batches/${id}`, { method: "DELETE" }),
  addBatchSubject: (batchId: string, subjectId: string) => apiFetch<unknown>(`/api/v1/batches/${batchId}/subjects`, { body: { subject_id: subjectId } }),
  removeBatchSubject: (id: string) => apiFetch<void>(`/api/v1/batch-subjects/${id}`, { method: "DELETE" }),
  setInstructors: (id: string, instructorIds: string[]) =>
    apiFetch<void>(`/api/v1/batch-subjects/${id}/instructors`, { method: "PUT", body: { instructor_ids: instructorIds } }),
  addSlot: (id: string, body: { weekday: Weekday; starts_at: string; ends_at: string }) =>
    apiFetch<ScheduleSlotRow>(`/api/v1/batch-subjects/${id}/slots`, { body }),
  removeSlot: (id: string) => apiFetch<void>(`/api/v1/schedule-slots/${id}`, { method: "DELETE" }),
  assignableInstructors: () => apiFetch<{ id: string; full_name: string }[]>("/api/v1/academic/assignable-instructors"),
};
