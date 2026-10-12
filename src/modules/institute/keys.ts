// TanStack Query keys for the institute app.
export const instituteKeys = {
  modules: () => ["institute-modules"],
  audit: (params?: object) => ["institute-audit", params ?? {}],
  users: () => ["institute-users"],
  roles: () => ["institute-roles"],
  profile: () => ["institute-profile"],
  signatures: () => ["institute-signatures"],
  studentIdPattern: () => ["institute-student-id-pattern"],
  instructors: (params?: object) => ["institute-instructors", params ?? {}],
  instructor: (id: string) => ["institute-instructor", id],
  courses: (params?: object) => ["institute-courses", params ?? {}],
  course: (id: string) => ["institute-course", id],
  batch: (id: string) => ["institute-batch", id],
  assignableInstructors: () => ["institute-assignable-instructors"],
};
