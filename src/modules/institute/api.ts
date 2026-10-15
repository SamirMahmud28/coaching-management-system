import type { AppTheme } from "@/lib/app-themes";
import type {
  Appearance, Background, BodyFont, ButtonStyle, CardStyle, CourseLayout, Density, GalleryLayout, GradientChoice, HeaderStyle, HeroLayout, HeroOverlay,
  FaqLayout, MotionLevel, NoticeLayout, PaletteChoice, Radius, SiteLanguage, TestimonialLayout, TextSize, WebsiteFont, WebsiteTheme,
} from "@/server/modules/website/design";
import type { FeatureIcon, SocialNetwork } from "@/server/modules/website/site-content";
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

/** The institute's app theme and paper background (null = automatic, on with Classic Amber) (D156, D158). */
export interface AppearanceRow {
  app_theme: AppTheme;
  paper_background: boolean | null;
}

export const settingsApi = {
  profile: () => apiFetch<InstitutionProfileRow>("/api/v1/settings/institution"),
  saveProfile: (body: Omit<InstitutionProfileRow, "is_default">) => apiFetch<InstitutionProfileRow>("/api/v1/settings/institution", { method: "PUT", body }),
  appearance: () => apiFetch<AppearanceRow>("/api/v1/settings/appearance"),
  saveAppearance: (theme: AppTheme, paper: boolean | null) =>
    apiFetch<AppearanceRow>("/api/v1/settings/appearance", { method: "PUT", body: { app_theme: theme, paper_background: paper } }),
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
  photo_file_id: string | null;
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
  batches: (q: { course_id?: string; status?: AcademicStatus } = {}) =>
    apiFetch<{ id: string; name: string; status: AcademicStatus; course_id: string; course_name: string; course_code: string }[]>("/api/v1/batches", { query: q }),
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

export type StudentStatus = "ACTIVE" | "ON_HOLD" | "COMPLETED" | "LEFT";
export type MembershipStatus = "ACTIVE" | "COMPLETED" | "LEFT";
export const GUARDIAN_RELATIONS = ["FATHER", "MOTHER", "BROTHER", "SISTER", "UNCLE", "AUNT", "GRANDPARENT", "OTHER"] as const;
export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number];

/** Profile fields an Admin edits. Mobile numbers and the address come back null for viewers without contact access. */
export interface StudentFields {
  full_name: string;
  gender: Gender;
  date_of_birth: string | null;
  phone: string | null;
  school_name: string | null;
  school_class: string | null;
  address: string | null;
  admin_note: string | null;
  guardian_name: string;
  guardian_relation: GuardianRelation;
  guardian_phone: string | null;
  photo_file_id: string | null;
}

export interface StudentListRow {
  id: string;
  student_code: string;
  full_name: string;
  gender: Gender;
  photo_file_id: string | null;
  guardian_name: string;
  guardian_phone: string | null;
  phone: string | null;
  status: StudentStatus;
  batches: { id: string; name: string }[];
}

export interface MembershipRow {
  id: string;
  batch_id: string;
  batch_name: string;
  batch_status: AcademicStatus;
  course_id: string;
  course_name: string;
  course_code: string;
  status: MembershipStatus;
  started_on: string;
  ended_on: string | null;
  roll_number: string | null;
}

export interface StudentDetail extends StudentFields {
  id: string;
  user_id: string;
  student_code: string;
  username: string | null;
  must_change_password: boolean;
  status: StudentStatus;
  admission_date: string;
  admission_course: { id: string; name: string; code: string } | null;
  created_at: string;
  memberships: MembershipRow[];
  status_history: { id: string; from_status: StudentStatus | null; to_status: StudentStatus; reason: string | null; changed_at: string; changed_by_name: string | null }[];
}

export interface BatchStudentRow {
  membership_id: string;
  roll_number: string | null;
  started_on: string;
  id: string;
  student_code: string;
  full_name: string;
  status: StudentStatus;
}

export interface AdmitFields extends Omit<StudentFields, "guardian_phone"> {
  guardian_phone: string;
  admission_date: string | null;
  course_id: string | null;
  batch_ids: string[];
  student_code: string | null;
  temporary_password: string;
}

export const studentsApi = {
  list: (q: { q?: string; status?: StudentStatus | "ALL"; course_id?: string; batch_id?: string; no_batch?: "true"; page?: number; page_size?: number }) =>
    apiFetch<Paginated<StudentListRow>>("/api/v1/students", { query: q }),
  get: (id: string) => apiFetch<StudentDetail>(`/api/v1/students/${id}`),
  admit: (body: AdmitFields) => apiFetch<{ student: StudentDetail; temporary_password: string }>("/api/v1/students", { body }),
  update: (id: string, body: Partial<StudentFields>) => apiFetch<StudentDetail>(`/api/v1/students/${id}`, { method: "PATCH", body }),
  setStatus: (id: string, status: StudentStatus, reason: string | null) =>
    apiFetch<StudentDetail>(`/api/v1/students/${id}/status`, { method: "PATCH", body: { status, reason } }),
  resetPassword: (id: string, temporaryPassword: string) =>
    apiFetch<{ temporary_password: string }>(`/api/v1/students/${id}/reset-password`, { body: { temporary_password: temporaryPassword } }),
  join: (id: string, body: { batch_id: string; started_on: string | null; roll_number: string | null }) => apiFetch<unknown>(`/api/v1/students/${id}/memberships`, { body }),
  setRoll: (membershipId: string, rollNumber: string | null) =>
    apiFetch<unknown>(`/api/v1/batch-memberships/${membershipId}`, { method: "PATCH", body: { roll_number: rollNumber } }),
  endMembership: (membershipId: string, body: { status: "COMPLETED" | "LEFT"; ended_on: string | null }) =>
    apiFetch<void>(`/api/v1/batch-memberships/${membershipId}/end`, { body }),
  batchStudents: (batchId: string) => apiFetch<BatchStudentRow[]>(`/api/v1/batches/${batchId}/students`),
};

export type FeeItemKind = "ADMISSION" | "MONTHLY" | "ONE_TIME";

export interface FeeItemRow {
  id: string;
  course_id: string;
  course_name: string;
  course_code: string;
  course_due_day: number | null;
  kind: FeeItemKind;
  name: string;
  /** Taka as text, e.g. "2000.00". */
  amount: string;
  status: AcademicStatus;
}

export interface StudentFeeAmountRow {
  fee_item_id: string;
  course_name: string;
  kind: FeeItemKind;
  name: string;
  course_amount: string;
  /** The student's own amount row, when set. */
  id: string | null;
  amount: string | null;
  reason: string | null;
}

export const feesApi = {
  items: (q: { course_id?: string; status?: AcademicStatus } = {}) => apiFetch<FeeItemRow[]>("/api/v1/fees/items", { query: q }),
  createItem: (body: { course_id: string; kind: FeeItemKind; name: string; amount: string }) => apiFetch<FeeItemRow>("/api/v1/fees/items", { body }),
  updateItem: (id: string, body: { name?: string; amount?: string }) => apiFetch<FeeItemRow>(`/api/v1/fees/items/${id}`, { method: "PATCH", body }),
  setItemStatus: (id: string, status: AcademicStatus) => apiFetch<FeeItemRow>(`/api/v1/fees/items/${id}/status`, { method: "PATCH", body: { status } }),
  deleteItem: (id: string) => apiFetch<void>(`/api/v1/fees/items/${id}`, { method: "DELETE" }),
  studentAmounts: (studentId: string) => apiFetch<StudentFeeAmountRow[]>(`/api/v1/students/${studentId}/fee-amounts`),
  setStudentAmount: (studentId: string, body: { fee_item_id: string; amount: string; reason: string }) =>
    apiFetch<unknown>(`/api/v1/students/${studentId}/fee-amounts`, { method: "PUT", body }),
  removeStudentAmount: (id: string) => apiFetch<void>(`/api/v1/student-fee-amounts/${id}`, { method: "DELETE" }),
  settings: () => apiFetch<{ receipt_prefix: string }>("/api/v1/fees/settings"),
  saveSettings: (receiptPrefix: string) => apiFetch<{ receipt_prefix: string }>("/api/v1/fees/settings", { method: "PUT", body: { receipt_prefix: receiptPrefix } }),
};

export type SkipReason = "ON_HOLD" | "COMPLETED" | "LEFT" | "NOT_IN_COURSE" | "JOINED_LATER" | "ALREADY_CHARGED" | "ZERO_AMOUNT" | "EXCLUDED";

export interface GenerationPreview {
  fee_item: { id: string; name: string; kind: FeeItemKind; amount: string; course_id: string; course_name: string };
  period: string;
  period_label: string;
  due_date: string;
  to_charge: { student_id: string; student_code: string; full_name: string; amount: string; own_amount: boolean }[];
  skipped: { student_id: string; student_code: string; full_name: string; reason: SkipReason }[];
  total: string;
}

export interface GenerationRunRow {
  id: string;
  fee_item_id: string;
  fee_item_name: string;
  course_name: string;
  period: string;
  created_count: number;
  active_count: number;
  skipped: Partial<Record<SkipReason, number>>;
  total_amount: string;
  created_at: string;
}

export type ChargeState = "DUE" | "PAID" | "WAIVED" | "CANCELLED";

export interface ChargeRow {
  id: string;
  course_name: string | null;
  source: "GENERATED" | "FINE";
  title: string;
  period: string | null;
  amount: string;
  waived: string;
  net: string;
  due_date: string;
  note: string | null;
  state: ChargeState;
  overdue: boolean;
  paid_by: { payment_id: string; receipt_label: string; paid_on: string; amount: string } | null;
  refunded: string;
  cancel_reason: string | null;
}

export const chargesApi = {
  preview: (body: { fee_item_id: string; period?: string | null }) => apiFetch<GenerationPreview>("/api/v1/fees/generation/preview", { body }),
  generate: (body: { fee_item_id: string; period?: string | null; exclude: string[]; amounts: { student_id: string; amount: string }[] }) =>
    apiFetch<{ id: string; period_label: string; created_count: number; total: string; due_date: string }>("/api/v1/fees/generation", { body }),
  runs: () => apiFetch<GenerationRunRow[]>("/api/v1/fees/runs"),
  cancelRun: (id: string, reason: string) => apiFetch<{ cancelled: number; kept_paid: number }>(`/api/v1/fees/runs/${id}/cancel`, { body: { reason } }),
  studentCharges: (studentId: string) => apiFetch<ChargeRow[]>(`/api/v1/students/${studentId}/fee-charges`),
  addFine: (studentId: string, body: { amount: string; reason: string; due_date: string | null }) => apiFetch<ChargeRow>(`/api/v1/students/${studentId}/fines`, { body }),
  cancelCharge: (id: string, reason: string) => apiFetch<ChargeRow>(`/api/v1/fee-charges/${id}/cancel`, { body: { reason } }),
};

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHEQUE", "BKASH", "NAGAD", "ROCKET", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
  OTHER: "Other",
};

export interface PaymentRow {
  id: string;
  receipt_no: number;
  receipt_label: string;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  amount: string;
  remarks: string | null;
  status: "VALID" | "VOID";
  void_reason: string | null;
  received_by_name: string | null;
  lines: { charge_id: string; title: string; amount: string }[];
  refunds?: { amount: string; method: PaymentMethod; reason: string; refunded_on: string }[];
}

export const paymentsApi = {
  list: (studentId: string) => apiFetch<PaymentRow[]>(`/api/v1/students/${studentId}/payments`),
  collect: (
    studentId: string,
    body: {
      charge_ids: string[];
      paid_on: string;
      method: PaymentMethod;
      reference: string | null;
      remarks: string | null;
      idempotency_key: string;
      waivers?: { charge_id: string; kind: "FIXED" | "PERCENT"; value: string; reason: string }[];
      fines?: { amount: string; reason: string }[];
    },
  ) =>
    apiFetch<PaymentRow>(`/api/v1/students/${studentId}/payments`, { body }),
  void: (id: string, reason: string) => apiFetch<PaymentRow>(`/api/v1/fee-payments/${id}/void`, { body: { reason } }),
  waive: (chargeId: string, body: { kind: "FIXED" | "PERCENT"; value: string; reason: string }) => apiFetch<ChargeRow>(`/api/v1/fee-charges/${chargeId}/waivers`, { body }),
  refund: (chargeId: string, body: { amount: string; method: PaymentMethod; reference: string | null; reason: string; refunded_on: string }) =>
    apiFetch<ChargeRow>(`/api/v1/fee-charges/${chargeId}/refunds`, { body }),
};

export const receiptUrl = (paymentId: string) => `/app/print/fee-receipt?payment=${paymentId}`;

export type FeeReportKind = "collections" | "dues" | "former-dues" | "refunds";
export interface ReportFilters {
  from?: string;
  to?: string;
  course_id?: string;
  batch_id?: string;
}

export interface CollectionReport {
  range: { from: string; to: string };
  payments: { payment_id: string; receipt_label: string; paid_on: string; student_name: string; student_code: string; method: PaymentMethod; amount: string }[];
  by_method: { method: PaymentMethod; amount: string }[];
  collected: string;
  refunded: string;
  net: string;
  voided: { payment_id: string; receipt_label: string; paid_on: string; student_name: string; student_code: string; amount: string; void_reason: string | null }[];
}

export interface DuesReport {
  rows: { student_id: string; student_name: string; student_code: string; status: StudentStatus; guardian_phone: string | null; unpaid_count: number; total_due: string; overdue: string; oldest_due: string | null }[];
  total_due: string;
  total_overdue: string;
}

export interface RefundsReport {
  refunds: { id: string; refunded_on: string; amount: string; method: PaymentMethod; reason: string; charge_title: string; receipt_label: string; student_name: string; student_code: string }[];
  total: string;
}

export const reportsApi = {
  collections: (q: ReportFilters) => apiFetch<CollectionReport>("/api/v1/fees/reports/collections", { query: { ...q } }),
  dues: (q: ReportFilters & { former?: "true" }) => apiFetch<DuesReport>("/api/v1/fees/reports/dues", { query: { ...q } }),
  refunds: (q: ReportFilters) => apiFetch<RefundsReport>("/api/v1/fees/reports/refunds", { query: { ...q } }),
};

export const reportPrintUrl = (report: FeeReportKind, q: ReportFilters) =>
  `/app/print/fee-report?${new URLSearchParams({ report, ...Object.fromEntries(Object.entries(q).filter(([, v]) => v)) }).toString()}`;

// Attendance (paid module): class registers (D80–D86).
export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
export type ClassState = "NOT_TAKEN" | "OPEN" | "TAKEN" | "NOT_HELD";

export interface DayClassRow {
  batch_subject_id: string;
  batch_id: string;
  batch_name: string;
  course_name: string;
  subject_name: string;
  starts_at: string;
  ends_at: string;
  source: "SCHEDULED" | "EXTRA";
  class_id: string | null;
  state: ClassState;
  not_held_reason: string | null;
  counts: { present: number; absent: number; late: number; excused: number } | null;
  /** Set when the Routine module is on: moved here, or a substitute (D116, D121). */
  routine_note?: string | null;
}

export interface RegisterSubject {
  id: string;
  batch_id: string;
  batch_name: string;
  course_name: string;
  subject_name: string;
}

export interface DayClasses {
  date: string;
  today: string;
  classes: DayClassRow[];
  subjects: RegisterSubject[];
}

export interface RegisterRow {
  student_id: string;
  membership_id: string;
  student_code: string;
  full_name: string;
  photo_file_id: string | null;
  roll_number: string | null;
  status: AttendanceStatus | null;
  on_leave: boolean;
  effective: AttendanceStatus | null;
}

export interface Register {
  batch_subject_id: string;
  batch_name: string;
  course_name: string;
  subject_name: string;
  date: string;
  starts_at: string;
  ends_at: string;
  source: "SCHEDULED" | "EXTRA";
  class_id: string | null;
  state: ClassState;
  not_held_reason: string | null;
  can_edit: boolean;
  reason_required: boolean;
  why_not: string | null;
  rows: RegisterRow[];
}

export interface ClassRef {
  date: string;
  starts_at: string;
}

const registerPath = (batchSubjectId: string) => `/api/v1/attendance/batch-subjects/${batchSubjectId}`;

export const attendanceApi = {
  classes: (date?: string) => apiFetch<DayClasses>("/api/v1/attendance/classes", { query: date ? { date } : {} }),
  register: (batchSubjectId: string, at: ClassRef) => apiFetch<Register>(`${registerPath(batchSubjectId)}/register`, { query: { ...at } }),
  save: (batchSubjectId: string, body: ClassRef & { marks: { student_id: string; status: AttendanceStatus }[]; reason?: string | null }) =>
    apiFetch<Register>(`${registerPath(batchSubjectId)}/register`, { method: "PUT", body }),
  notHeld: (batchSubjectId: string, body: ClassRef & { reason: string }) => apiFetch<Register>(`${registerPath(batchSubjectId)}/not-held`, { body }),
  addExtra: (batchSubjectId: string, body: ClassRef & { ends_at: string }) =>
    apiFetch<{ id: string; date: string; starts_at: string; ends_at: string }>(`${registerPath(batchSubjectId)}/extra-classes`, { body }),
};

// Leave (D89–D93).
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "REVOKED";

export interface LeaveRow {
  id: string;
  student_id: string;
  student_code: string;
  student_name: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string;
  source: "STUDENT" | "OFFICE";
  status: LeaveStatus;
  applied_at: string;
  applied_by_name?: string | null;
  decided_at: string | null;
  decided_by_name?: string | null;
  decision_note: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}

export interface LeaveDates {
  from_date: string;
  to_date: string;
  reason: string;
}

export const leaveApi = {
  list: (q: { status?: LeaveStatus; student_id?: string } = {}) => apiFetch<LeaveRow[]>("/api/v1/leave", { query: q }),
  enter: (studentId: string, body: LeaveDates) => apiFetch<LeaveRow & { classes_excused: number }>(`/api/v1/students/${studentId}/leave`, { body }),
  decide: (id: string, body: { decision: "APPROVE" | "REJECT"; note?: string | null }) =>
    apiFetch<LeaveRow & { classes_excused: number }>(`/api/v1/leave/${id}/decision`, { body }),
  revoke: (id: string, reason: string) => apiFetch<LeaveRow & { classes_restored: number }>(`/api/v1/leave/${id}/revoke`, { body: { reason } }),
  mine: () => apiFetch<LeaveRow[]>("/api/v1/me/leave"),
  apply: (body: LeaveDates) => apiFetch<LeaveRow>("/api/v1/me/leave", { body }),
  withdraw: (id: string) => apiFetch<void>(`/api/v1/me/leave/${id}/withdraw`, { method: "POST" }),
};

// Attendance reports (D87, D88).
export interface AttendanceTallyWire {
  present: number;
  late: number;
  absent: number;
  excused: number;
  percentage: number | null;
}

export interface AttendanceReportOptions {
  courses: { id: string; name: string }[];
  batches: { id: string; name: string; course_id: string; course_name: string; subjects: { id: string; name: string }[] }[];
  today: string;
}

export interface MonthlyRegisterReport {
  batch_id: string;
  batch_name: string;
  course_name: string;
  subject_name: string | null;
  month: string;
  month_label: string;
  classes: { id: string; date: string; starts_at: string; subject_name: string }[];
  not_held: number;
  rows: ({ student_id: string; student_code: string; full_name: string; roll_number: string | null; statuses: (AttendanceStatus | null)[] } & AttendanceTallyWire)[];
}

export interface LowAttendanceReport {
  range: { from: string; to: string };
  below: number;
  rows: ({ student_id: string; student_code: string; full_name: string; guardian_name: string; guardian_phone: string | null } & AttendanceTallyWire)[];
}

export interface AbsenteesReport {
  date: string;
  rows: { student_id: string; student_code: string; full_name: string; guardian_name: string; guardian_phone: string | null; missed: { batch_name: string; subject_name: string; starts_at: string }[] }[];
}

export interface AttendanceHistory {
  range: { from: string; to: string };
  overall: AttendanceTallyWire;
  by_subject: ({ batch_name: string; subject_name: string } & AttendanceTallyWire)[];
  entries: { date: string; starts_at: string; batch_name: string; subject_name: string; status: AttendanceStatus | null; on_leave: boolean }[];
}

export const attendanceReportsApi = {
  options: () => apiFetch<AttendanceReportOptions>("/api/v1/attendance/reports/options"),
  register: (q: { batch_id: string; month: string; batch_subject_id?: string }) => apiFetch<MonthlyRegisterReport>("/api/v1/attendance/reports/register", { query: q }),
  low: (q: { from: string; to: string; below: number; course_id?: string; batch_id?: string }) => apiFetch<LowAttendanceReport>("/api/v1/attendance/reports/low", { query: q }),
  absentees: (q: { date: string; batch_id?: string }) => apiFetch<AbsenteesReport>("/api/v1/attendance/reports/absentees", { query: q }),
  studentHistory: (studentId: string, q: { from: string; to: string }) => apiFetch<AttendanceHistory>(`/api/v1/students/${studentId}/attendance`, { query: q }),
};

export const attendanceRegisterPrintUrl = (q: { batch_id: string; month: string; batch_subject_id?: string }) =>
  `/app/print/attendance-register?${new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => !!e[1])).toString()}`;

// Fees F7 (D99): every receipt in a date range.
export interface PaymentListRow {
  id: string;
  receipt_label: string;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  amount: string;
  status: "VALID" | "VOID";
  void_reason: string | null;
  student_id: string;
  student_name: string;
  student_code: string;
  received_by_name: string | null;
  refunds: number;
}

export const paymentListApi = {
  list: (q: { from: string; to: string; status?: "VALID" | "VOID" }) =>
    apiFetch<{ range: { from: string; to: string }; total: string; count: number; payments: PaymentListRow[] }>("/api/v1/fees/payments", { query: q }),
};

// Exams & Results (D101–D110).
export type ExamKind = "WEEKLY" | "MONTHLY" | "MODEL" | "CUSTOM";
export type ExamState = "DRAFT" | "PUBLISHED";
export const EXAM_KIND_LABEL: Record<ExamKind, string> = { WEEKLY: "Weekly", MONTHLY: "Monthly", MODEL: "Model test", CUSTOM: "Custom" };

export interface ExamRow {
  id: string;
  name: string;
  kind: ExamKind;
  course_id: string;
  course_name: string;
  starts_on: string;
  ends_on: string;
  state: ExamState;
  show_grades: boolean;
  published_at: string | null;
  paper_count: number;
  batches: { id: string; name: string }[];
}

export interface ExamPaperPart {
  id: string;
  name: string;
  full_marks: string;
  pass_marks: string | null;
}

export interface ExamPaper {
  id: string;
  subject_id: string;
  subject_name: string;
  full_marks: string;
  pass_marks: string;
  optional: boolean;
  mark_count: number;
  locked: boolean;
  can_open_marks: boolean;
  parts: ExamPaperPart[];
}

export interface ExamDetail {
  id: string;
  name: string;
  kind: ExamKind;
  course_id: string;
  course_name: string;
  starts_on: string;
  ends_on: string;
  syllabus: string | null;
  show_grades: boolean;
  state: ExamState;
  published_at: string | null;
  batches: { id: string; name: string; status: AcademicStatus }[];
  papers: ExamPaper[];
  has_marks: boolean;
}

export interface ExamSetupCourse {
  id: string;
  name: string;
  code: string;
  subjects: { id: string; name: string }[];
  batches: { id: string; name: string }[];
}

export interface ExamFormBody {
  name: string;
  kind: ExamKind;
  starts_on: string;
  ends_on: string;
  syllabus: string | null;
  show_grades: boolean;
  batch_ids: string[];
  papers: { subject_id: string; full_marks: string; pass_marks: string; optional: boolean; parts: { name: string; full_marks: string; pass_marks: string | null }[] }[];
}

export interface GradeBandWire {
  grade: string;
  min_percent: number;
  grade_point: number;
}

export const examsApi = {
  options: () => apiFetch<ExamSetupCourse[]>("/api/v1/exams/options"),
  list: (q: { course_id?: string; state?: ExamState } = {}) => apiFetch<ExamRow[]>("/api/v1/exams", { query: q }),
  get: (id: string) => apiFetch<ExamDetail>(`/api/v1/exams/${id}`),
  create: (body: ExamFormBody & { course_id: string }) => apiFetch<ExamDetail>("/api/v1/exams", { body }),
  update: (id: string, body: ExamFormBody) => apiFetch<ExamDetail>(`/api/v1/exams/${id}`, { method: "PUT", body }),
  remove: (id: string) => apiFetch<void>(`/api/v1/exams/${id}`, { method: "DELETE" }),
  gradeScale: () => apiFetch<{ bands: GradeBandWire[]; is_default: boolean }>("/api/v1/exams/grade-scale"),
  saveGradeScale: (bands: GradeBandWire[]) => apiFetch<{ bands: GradeBandWire[]; is_default: boolean }>("/api/v1/exams/grade-scale", { method: "PUT", body: { bands } }),
  resetGradeScale: () => apiFetch<{ bands: GradeBandWire[]; is_default: boolean }>("/api/v1/exams/grade-scale", { method: "DELETE" }),
};

export interface MarkWire {
  absent: boolean;
  obtained: string | null;
  parts: Record<string, string>;
}

export interface Roster {
  paper: {
    id: string;
    exam_id: string;
    exam_name: string;
    exam_state: ExamState;
    subject_name: string;
    full_marks: string;
    pass_marks: string;
    optional: boolean;
    parts: { id: string; name: string; full_marks: string; pass_marks: string | null }[];
  };
  can_edit: boolean;
  reason_required: boolean;
  why_not: string | null;
  rows: { student_id: string; student_code: string; full_name: string; roll_number: string | null; batch_id: string; batch_name: string; mark: MarkWire | null }[];
}

export interface MarkEntryWire {
  student_id: string;
  clear?: boolean;
  absent?: boolean;
  obtained?: string | null;
  parts?: { part_id: string; obtained: string }[];
}

export const marksApi = {
  roster: (paperId: string) => apiFetch<Roster>(`/api/v1/exam-papers/${paperId}/marks`),
  save: (paperId: string, body: { entries: MarkEntryWire[]; reason?: string | null }) => apiFetch<Roster & { saved: number }>(`/api/v1/exam-papers/${paperId}/marks`, { method: "PUT", body }),
};

export interface PaperOutcomeWire {
  paper_id: string;
  name: string;
  optional: boolean;
  full_marks: number;
  pass_marks: number;
  status: "PASSED" | "FAILED" | "ABSENT" | "PENDING" | "NOT_TAKEN";
  obtained: number | null;
  grade: string | null;
  grade_point: number | null;
  parts: { name: string; full_marks: number; pass_marks: number | null; obtained: number | null; passed: boolean | null }[];
}

export interface StudentOutcomeWire {
  papers: PaperOutcomeWire[];
  status: "COMPLETE" | "PENDING" | "ABSENT";
  total_obtained: number;
  total_full: number;
  passed: boolean | null;
  failed_papers: number;
  gpa: number | null;
  grade: string | null;
}

export interface ResultRowWire {
  student_id: string;
  student_code: string;
  full_name: string;
  batch_id: string;
  batch_name: string;
  roll_number: string | null;
  position: number | null;
  outcome: StudentOutcomeWire;
}

export interface ExamResults {
  exam: { id: string; name: string; kind: ExamKind; course_name: string; starts_on: string; ends_on: string; state: ExamState; show_grades: boolean; published_at: string | null };
  batches: { id: string; name: string }[];
  papers: { id: string; subject_name: string; full_marks: string; pass_marks: string; optional: boolean }[];
  summary: { sitting: number; passed: number; failed: number; absent: number; pending: number; highest: number | null; average: number | null };
  missing: { student_id: string; student_code: string; full_name: string; batch_name: string; papers: string[] }[];
  rows: ResultRowWire[];
}

export const resultsApi = {
  get: (examId: string, batchId?: string) => apiFetch<ExamResults>(`/api/v1/exams/${examId}/results`, { query: batchId ? { batch_id: batchId } : {} }),
  publish: (examId: string) => apiFetch<{ published_at: string; sitting: number; passed: number; failed: number; absent: number }>(`/api/v1/exams/${examId}/publish`, { method: "POST" }),
};

const printQuery = (q: Record<string, string | undefined>) => new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => !!e[1])).toString();
export const marksheetUrl = (q: { exam: string; student?: string; batch?: string }) => `/app/print/exam-marksheet?${printQuery(q)}`;
export const meritListUrl = (q: { exam: string; batch?: string }) => `/app/print/exam-merit-list?${printQuery(q)}`;

// Routine & Lesson Plans (D114–D122).
export type RoutineClassStatus = "SCHEDULED" | "CANCELLED" | "HOLIDAY" | "MOVED_AWAY" | "MOVED_IN";

export interface RoutineClassRow {
  batch_subject_id: string;
  batch_id: string;
  batch_name: string;
  course_name: string;
  subject_name: string;
  date: string;
  starts_at: string;
  ends_at: string;
  status: RoutineClassStatus;
  reason: string | null;
  substitute_instructor_id: string | null;
  substitute_name: string | null;
  change_id: string | null;
  holiday_id: string | null;
  moved_to: { date: string; starts_at: string; ends_at: string } | null;
  moved_from: { date: string; starts_at: string } | null;
  instructors: { id: string; name: string }[];
  regular_instructors: { id: string; name: string }[];
}

export interface RoutineOptions {
  batches: { id: string; name: string; course_name: string }[];
  instructors: { id: string; name: string; status: string }[];
  today: string;
}

export interface RoutineChangeRow {
  id: string;
  kind: "CANCEL" | "RESCHEDULE" | "SUBSTITUTE";
  batch_subject_id: string;
  batch_name: string;
  course_name: string;
  subject_name: string;
  class_date: string;
  starts_at: string;
  reason: string | null;
  new_date: string | null;
  new_starts_at: string | null;
  new_ends_at: string | null;
  substitute_name: string | null;
  created_at: string;
}

export interface HolidayRow {
  id: string;
  name: string;
  from_date: string;
  to_date: string;
}

export interface RoutineChangeBody {
  batch_subject_id: string;
  class_date: string;
  starts_at: string;
  kind: "CANCEL" | "RESCHEDULE" | "SUBSTITUTE";
  reason?: string | null;
  new_date?: string | null;
  new_starts_at?: string | null;
  new_ends_at?: string | null;
  substitute_instructor_id?: string | null;
}

export const routineApi = {
  options: () => apiFetch<RoutineOptions>("/api/v1/routine/options"),
  batchWeek: (batchId: string, from: string, days = 7) => apiFetch<{ from: string; to: string; classes: RoutineClassRow[] }>(`/api/v1/routine/batches/${batchId}`, { query: { from, days } }),
  instructorWeek: (instructorId: string, from: string, days = 7) => apiFetch<{ from: string; to: string; classes: RoutineClassRow[] }>(`/api/v1/routine/instructors/${instructorId}`, { query: { from, days } }),
  day: (date: string) => apiFetch<{ date: string; classes: RoutineClassRow[] }>("/api/v1/routine/day", { query: { date } }),
  changes: (from?: string) => apiFetch<{ from: string; changes: RoutineChangeRow[]; holidays: HolidayRow[] }>("/api/v1/routine/changes", { query: from ? { from } : {} }),
  createChange: (body: RoutineChangeBody) => apiFetch<{ id: string }>("/api/v1/routine/changes", { body }),
  withdrawChange: (id: string) => apiFetch<void>(`/api/v1/routine/changes/${id}/withdraw`, { method: "POST" }),
  createHoliday: (body: { name: string; from_date: string; to_date?: string | null }) => apiFetch<HolidayRow>("/api/v1/routine/holidays", { body }),
  withdrawHoliday: (id: string) => apiFetch<void>(`/api/v1/routine/holidays/${id}/withdraw`, { method: "POST" }),
};

export type TopicStatus = "PENDING" | "ONGOING" | "COMPLETED";

export interface LessonProgress {
  total: number;
  completed: number;
  ongoing: number;
  overdue: number;
  percent: number | null;
}

export interface LessonOverviewRow {
  id: string;
  batch_id: string;
  batch_name: string;
  course_name: string;
  subject_id: string;
  subject_name: string;
  editable: boolean;
  progress: LessonProgress;
}

export interface LessonTopicRow {
  id: string;
  title: string;
  start_date: string | null;
  target_date: string | null;
  status: TopicStatus;
  completed_on: string | null;
  overdue: boolean;
}

export interface LessonPlanDetail extends Omit<LessonOverviewRow, "progress"> {
  topics: LessonTopicRow[];
  progress: LessonProgress;
  copy_sources: { id: string; batch_name: string; course_name: string }[];
}

export const lessonsApi = {
  overview: () => apiFetch<LessonOverviewRow[]>("/api/v1/lessons"),
  plan: (batchSubjectId: string) => apiFetch<LessonPlanDetail>(`/api/v1/lessons/${batchSubjectId}`),
  addTopic: (batchSubjectId: string, body: { title: string; start_date?: string | null; target_date?: string | null }) => apiFetch<{ id: string }>(`/api/v1/lessons/${batchSubjectId}/topics`, { body }),
  updateTopic: (id: string, body: { title?: string; start_date?: string | null; target_date?: string | null; status?: TopicStatus }) => apiFetch<{ id: string }>(`/api/v1/lesson-topics/${id}`, { method: "PATCH", body }),
  deleteTopic: (id: string) => apiFetch<void>(`/api/v1/lesson-topics/${id}`, { method: "DELETE" }),
  reorder: (batchSubjectId: string, topicIds: string[]) => apiFetch<void>(`/api/v1/lessons/${batchSubjectId}/order`, { method: "PUT", body: { topic_ids: topicIds } }),
  copy: (batchSubjectId: string, fromBatchSubjectId: string) => apiFetch<{ copied: number }>(`/api/v1/lessons/${batchSubjectId}/copy`, { body: { from_batch_subject_id: fromBatchSubjectId } }),
};

// --- Website (paid module `website`) -----------------------------------------------------------------------------

export type { WebsiteSectionKey } from "@/server/modules/website/design";
import type { WebsiteSectionKey } from "@/server/modules/website/design";

/** The design settings on the wire (D135, D136); values are those of `src/server/modules/website/design.ts`. */
export interface WebsiteDesignWire {
  palette: PaletteChoice;
  custom_primary: string | null;
  custom_accent: string | null;
  gradient: GradientChoice;
  body_font: BodyFont;
  text_size: TextSize;
  radius: Radius;
  button_style: ButtonStyle;
  card_style: CardStyle;
  density: Density;
  background: Background;
  appearance: Appearance;
  header_style: HeaderStyle;
  hero_layout: HeroLayout;
  hero_overlay: HeroOverlay;
  gallery_layout: GalleryLayout;
  testimonial_layout: TestimonialLayout;
  course_layout: CourseLayout;
  notice_layout: NoticeLayout;
  faq_layout: FaqLayout;
  motion: MotionLevel;
  language: SiteLanguage;
}

/** Section titles, the announcement bar and social links on the wire (D138, D140). */
export interface WebsiteContentWire {
  section_titles: Partial<Record<WebsiteSectionKey, { title: string | null; subtitle: string | null }>>;
  announcement: { text: string; link_url: string | null; link_label: string | null; show_until: string | null } | null;
  social: Record<SocialNetwork, string | null>;
  stats: { value: number; suffix: string | null; label: string }[];
  features: { icon: FeatureIcon; title: string; text: string | null }[];
  faqs: { question: string; answer: string }[];
  videos: { youtube_id: string; title: string | null }[];
  hero_slides: { image_file_id: string; heading: string | null; subheading: string | null }[];
  show_ticker: boolean;
}

export interface WebsiteSettingsBody {
  theme: WebsiteTheme;
  heading_font: WebsiteFont;
  design: WebsiteDesignWire;
  content: WebsiteContentWire;
  sections: { key: WebsiteSectionKey; enabled: boolean; on_home: boolean }[];
  hero_heading: string | null;
  hero_subheading: string | null;
  hero_image_file_id: string | null;
  hero_button: "ENQUIRE" | "CALL" | "NONE";
  about_heading: string | null;
  about_text: string | null;
  about_image_file_id: string | null;
}

export interface WebsiteSettingsRow extends WebsiteSettingsBody {
  is_default: boolean;
  updated_at: string | null;
  /** From Institute Settings. */
  brand: { primary_color: string | null; phone: string | null; address: string | null };
}

export const websiteApi = {
  settings: () => apiFetch<WebsiteSettingsRow>("/api/v1/website/settings"),
  saveSettings: (body: WebsiteSettingsBody) => apiFetch<WebsiteSettingsRow>("/api/v1/website/settings", { method: "PUT", body }),
};

export type NoticeStatus = "ON_WEBSITE" | "SCHEDULED" | "EXPIRED" | "HIDDEN";

export interface WebsiteNoticeRow {
  id: string;
  title: string;
  body: string;
  notice_date: string;
  pinned: boolean;
  show_until: string | null;
  status: NoticeStatus;
}

export interface WebsiteNoticeBody {
  title: string;
  body: string;
  notice_date: string | null;
  pinned: boolean;
  show_until: string | null;
}

export interface GalleryPhotoRow {
  id: string;
  file_id: string;
  caption: string | null;
}

/** An instructor shown on the website (D141). */
export interface FacultyRow {
  id: string;
  instructor_id: string;
  name: string;
  photo_file_id: string | null;
  status: "ACTIVE" | "INACTIVE";
  line: string | null;
  subjects: string[];
}

export interface AchieverRow {
  id: string;
  name: string;
  result: string;
  exam: string | null;
  photo_file_id: string | null;
}

export interface AchieverBody {
  name: string;
  result: string;
  exam: string | null;
  photo_file_id: string | null;
}

export interface TestimonialRow {
  id: string;
  quote: string;
  name: string;
  line: string | null;
  photo_file_id: string | null;
}

export interface TestimonialBody {
  quote: string;
  name: string;
  line: string | null;
  photo_file_id: string | null;
}

export const websiteContentApi = {
  notices: () => apiFetch<{ items: WebsiteNoticeRow[] }>("/api/v1/website/notices"),
  createNotice: (body: WebsiteNoticeBody) => apiFetch<WebsiteNoticeRow>("/api/v1/website/notices", { body }),
  updateNotice: (id: string, body: WebsiteNoticeBody) => apiFetch<WebsiteNoticeRow>(`/api/v1/website/notices/${id}`, { method: "PATCH", body }),
  hideNotice: (id: string) => apiFetch<WebsiteNoticeRow>(`/api/v1/website/notices/${id}/hide`, { method: "POST" }),
  showNotice: (id: string) => apiFetch<WebsiteNoticeRow>(`/api/v1/website/notices/${id}/show`, { method: "POST" }),
  gallery: () => apiFetch<{ items: GalleryPhotoRow[]; limit: number }>("/api/v1/website/gallery"),
  addPhoto: (body: { file_id: string; caption?: string | null }) => apiFetch<GalleryPhotoRow>("/api/v1/website/gallery", { body }),
  updatePhoto: (id: string, caption: string | null) => apiFetch<GalleryPhotoRow>(`/api/v1/website/gallery/${id}`, { method: "PATCH", body: { caption } }),
  removePhoto: (id: string) => apiFetch<void>(`/api/v1/website/gallery/${id}`, { method: "DELETE" }),
  reorderGallery: (ids: string[]) => apiFetch<void>("/api/v1/website/gallery/order", { method: "PUT", body: { ids } }),
  testimonials: () => apiFetch<{ items: TestimonialRow[] }>("/api/v1/website/testimonials"),
  createTestimonial: (body: TestimonialBody) => apiFetch<TestimonialRow>("/api/v1/website/testimonials", { body }),
  updateTestimonial: (id: string, body: TestimonialBody) => apiFetch<TestimonialRow>(`/api/v1/website/testimonials/${id}`, { method: "PATCH", body }),
  removeTestimonial: (id: string) => apiFetch<void>(`/api/v1/website/testimonials/${id}`, { method: "DELETE" }),
  reorderTestimonials: (ids: string[]) => apiFetch<void>("/api/v1/website/testimonials/order", { method: "PUT", body: { ids } }),
  faculty: () => apiFetch<{ items: FacultyRow[]; candidates: { id: string; name: string }[]; limit: number }>("/api/v1/website/faculty"),
  addFaculty: (body: { instructor_id: string; line: string | null }) => apiFetch<FacultyRow>("/api/v1/website/faculty", { body }),
  updateFaculty: (id: string, line: string | null) => apiFetch<FacultyRow>(`/api/v1/website/faculty/${id}`, { method: "PATCH", body: { line } }),
  removeFaculty: (id: string) => apiFetch<void>(`/api/v1/website/faculty/${id}`, { method: "DELETE" }),
  reorderFaculty: (ids: string[]) => apiFetch<void>("/api/v1/website/faculty/order", { method: "PUT", body: { ids } }),
  achievers: () => apiFetch<{ items: AchieverRow[]; limit: number }>("/api/v1/website/achievers"),
  createAchiever: (body: AchieverBody) => apiFetch<AchieverRow>("/api/v1/website/achievers", { body }),
  updateAchiever: (id: string, body: AchieverBody) => apiFetch<AchieverRow>(`/api/v1/website/achievers/${id}`, { method: "PATCH", body }),
  removeAchiever: (id: string) => apiFetch<void>(`/api/v1/website/achievers/${id}`, { method: "DELETE" }),
  reorderAchievers: (ids: string[]) => apiFetch<void>("/api/v1/website/achievers/order", { method: "PUT", body: { ids } }),
};

export type EnquiryStatus = "NEW" | "CONTACTED" | "CONVERTED" | "CLOSED";

export interface EnquiryRow {
  id: string;
  name: string;
  mobile: string;
  course_id: string | null;
  course_name: string | null;
  message: string | null;
  status: EnquiryStatus;
  note: string | null;
  student_id: string | null;
  student_code: string | null;
  created_at: string;
  updated_at: string;
}

export const enquiriesApi = {
  list: (status?: EnquiryStatus) => apiFetch<{ items: EnquiryRow[]; counts: Record<EnquiryStatus, number> }>("/api/v1/website/enquiries", { query: status ? { status } : {} }),
  get: (id: string) => apiFetch<EnquiryRow>(`/api/v1/website/enquiries/${id}`),
  update: (id: string, body: { status?: EnquiryStatus; note?: string | null }) => apiFetch<EnquiryRow>(`/api/v1/website/enquiries/${id}`, { method: "PATCH", body }),
  convert: (id: string, studentId: string) => apiFetch<EnquiryRow>(`/api/v1/website/enquiries/${id}/convert`, { body: { student_id: studentId } }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Dashboard (U3, D163)
// ---------------------------------------------------------------------------------------------------------------------

export interface TallyWire {
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** (Present + Late) ÷ (Present + Late + Absent), one decimal; null when nothing counts yet. */
  percentage: number | null;
}

export interface DashboardSummary {
  students?: { active: number; on_hold: number; admitted_this_month: number };
  attendance?: { today: TallyWire; yesterday: number | null };
  fees?: { collected_this_month: string; collected_last_month_to_date: string; billed_this_month: string };
}

export type AttendancePeriod = "TODAY" | "WEEK" | "MONTH";

export interface DashboardBatchAttendance extends TallyWire {
  batch_id: string;
  batch_name: string;
  course_name: string;
}

export interface DashboardClass {
  batch_subject_id: string;
  batch_id: string;
  batch_name: string;
  course_name: string;
  subject_name: string;
  starts_at: string;
  ends_at: string;
  state: "NOT_TAKEN" | "OPEN" | "TAKEN" | "NOT_HELD";
  not_held_reason: string | null;
  routine_note: string | null;
  counts: { present: number; absent: number; late: number; excused: number } | null;
  instructors: string[];
  substitute: string | null;
  ended: boolean;
}

export interface DashboardFeeMonth {
  month: string;
  collected: string;
  billed: string;
  percent: number | null;
  students_billed: number;
  students_paid: number;
}

export interface DashboardAttentionItem {
  key: string;
  tone: "critical" | "warning" | "info";
  title: string;
  detail: string;
  count: number;
  href: string;
}

export interface DashboardUpcomingItem {
  key: string;
  kind: "EXAM" | "HOLIDAY" | "CANCELLED" | "SUBSTITUTE" | "RESCHEDULED";
  date: string;
  title: string;
  detail: string;
  href: string;
}

export const dashboardApi = {
  summary: () => apiFetch<DashboardSummary>("/api/v1/dashboard/summary"),
  attendance: (period: AttendancePeriod) =>
    apiFetch<{ period: AttendancePeriod; from: string; to: string; batches: DashboardBatchAttendance[]; overall: TallyWire }>("/api/v1/dashboard/attendance", { query: { period } }),
  classes: () =>
    apiFetch<{ date: string; today: string; can_take: boolean; counts: { total: number; taken: number; not_yet: number; not_held: number }; classes: DashboardClass[] }>("/api/v1/dashboard/classes"),
  fees: (year: number) =>
    apiFetch<{
      year: number;
      months: DashboardFeeMonth[];
      totals: { billed: string; collected: string; percent: number | null; students_billed: number; students_paid: number; student_months_billed: number };
    }>("/api/v1/dashboard/fees", { query: { year } }),
  attention: () => apiFetch<{ items: DashboardAttentionItem[] }>("/api/v1/dashboard/attention"),
  upcoming: () => apiFetch<{ items: DashboardUpcomingItem[] }>("/api/v1/dashboard/upcoming"),
  setup: () => apiFetch<{ steps: { key: string; title: string; done: boolean; href: string }[]; done: number }>("/api/v1/dashboard/setup"),
};
