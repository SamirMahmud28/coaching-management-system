// TanStack Query keys for the institute app.
export const instituteKeys = {
  modules: () => ["institute-modules"],
  audit: (params?: object) => ["institute-audit", params ?? {}],
  users: () => ["institute-users"],
  roles: () => ["institute-roles"],
  profile: () => ["institute-profile"],
  signatures: () => ["institute-signatures"],
  studentIdPattern: () => ["institute-student-id-pattern"],
};
