import { ValidationError } from "../../core/errors";
import { platformAccounts, platformUsers } from "../../core/db/schema";
import { inTransaction } from "../../core/db/transaction";
import type { DbOrTx } from "../../core/db/types";
import { hashPassword, passwordProblem } from "./password";

export interface NewPlatformLogin {
  name: string;
  email: string;
  password: string;
  mustChangePassword?: boolean;
}

/** Creates a Platform Admin and its credential account. */
export async function createPlatformLogin(db: DbOrTx, input: NewPlatformLogin) {
  const problem = passwordProblem(input.password);
  if (problem) throw new ValidationError("VALIDATION_TEMP_PASSWORD", problem, { field: "password" });

  const passwordHash = await hashPassword(input.password);
  return inTransaction(db, async (tx) => {
    const [platformUser] = await tx
      .insert(platformUsers)
      .values({
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        mustChangePassword: input.mustChangePassword ?? true,
      })
      .returning();
    // Better Auth's credential-account convention.
    await tx.insert(platformAccounts).values({
      userId: platformUser.id,
      accountId: platformUser.id,
      providerId: "credential",
      password: passwordHash,
    });
    return platformUser;
  });
}
