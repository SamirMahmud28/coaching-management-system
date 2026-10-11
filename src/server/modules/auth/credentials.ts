import { ValidationError } from "../../core/errors";
import { accounts, users } from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { normalizeBdMobile } from "@/lib/bd-phone";
import { hashPassword, passwordProblem } from "./password";

export interface NewLogin {
  tenantId: string;
  name: string;
  email?: string | null;
  // A BD mobile number (instructors sign in with it, D17); stored normalised as 01XXXXXXXXX.
  phone?: string | null;
  username?: string | null;
  password: string;
  mustChangePassword?: boolean;
}

/** Creates a tenant user and its credential account. Joins the caller's transaction if there is one. */
export async function createLogin(db: DbOrTx, input: NewLogin) {
  const problem = passwordProblem(input.password);
  if (problem) throw new ValidationError("VALIDATION_TEMP_PASSWORD", problem, { field: "password" });
  if (!input.email && !input.phone && !input.username) {
    throw new ValidationError("VALIDATION_LOGIN_IDENTIFIER", "A login needs an email, a mobile number or a username.");
  }
  const phone = input.phone ? normalizeBdMobile(input.phone) : null;
  if (input.phone && !phone) {
    throw new ValidationError("VALIDATION_PHONE", "Enter a valid Bangladeshi mobile number (01XXXXXXXXX).", { field: "phone" });
  }
  // A username must never be readable as another kind of identifier, or sign-in would be ambiguous.
  if (input.username && (input.username.includes("@") || normalizeBdMobile(input.username))) {
    throw new ValidationError("VALIDATION_USERNAME", "A username can't look like an email or a mobile number.", { field: "username" });
  }

  const passwordHash = await hashPassword(input.password);
  return inTransaction(db, async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        tenantId: input.tenantId,
        name: input.name,
        email: input.email ?? null,
        phone,
        username: input.username ?? null,
        mustChangePassword: input.mustChangePassword ?? true,
      })
      .returning();
    // Better Auth's credential-account convention.
    await tx.insert(accounts).values({
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: passwordHash,
    });
    return user;
  });
}
