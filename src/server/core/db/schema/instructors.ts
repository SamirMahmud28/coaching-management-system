import { foreignKey, index, pgEnum, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { files, tenants, users } from "./core";

export const instructorStatusEnum = pgEnum("instructor_status", ["ACTIVE", "INACTIVE"]);
export const genderEnum = pgEnum("gender", ["MALE", "FEMALE", "OTHER"]);

/**
 * An instructor: always has a login (signs in with mobile number or email, which live on `users`). Never
 * deleted; INACTIVE bans the login. Staff codes, salary and HR fields are out of Phase 1 scope.
 */
export const instructors = pgTable("instructors", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull(),
  fullName: varchar("full_name", { length: 100 }).notNull(),
  gender: genderEnum("gender"),
  address: text("address"),
  // Single-column on purpose: ON DELETE SET NULL on a composite key would null tenant_id. Checked by assertFileReference.
  photoFileId: uuid("photo_file_id").references(() => files.id, { onDelete: "set null" }),
  status: instructorStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
}, (t) => [
  unique("instructors_tenant_id_unique").on(t.tenantId, t.id),
  // One instructor record per login.
  unique("instructors_tenant_user_unique").on(t.tenantId, t.userId),
  index("instructors_tenant_status_idx").on(t.tenantId, t.status),
  foreignKey({ columns: [t.tenantId, t.userId], foreignColumns: [users.tenantId, users.id] }),
]);
