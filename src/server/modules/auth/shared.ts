import { APIError } from "better-auth/api";
import { passwordProblem } from "./password";

// Shared by both auth instances so a security fix applies to both.

export const DISABLED_BUILTIN_AUTH_PATHS = [
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/social",
  "/callback/:id",
  "/oauth2/callback/:providerId",
  "/request-password-reset",
  "/reset-password",
  "/reset-password/:token",
  "/verify-password",
  "/send-verification-email",
  "/verify-email",
  "/change-email",
  "/change-password", // replaced by each instance's own endpoint
  "/set-password",
  "/update-user",
  "/update-session",
  "/delete-user",
  "/delete-user/callback",
  "/link-social",
  "/unlink-account",
  "/list-accounts",
  "/account-info",
  "/refresh-token",
  "/get-access-token",
];

export const INVALID_CREDENTIALS = { code: "AUTH_INVALID_CREDENTIALS", message: "Invalid sign-in details or password." };

/**
 * Login CSRF guard. Better Auth only checks Origin on cookie-bearing requests, and a first
 * sign-in has no cookie. Requests without an Origin come from non-browser clients.
 */
export function assertSameOrigin(headers: Headers | undefined, expectedOrigin: string) {
  const origin = headers?.get("origin");
  if (origin && origin !== expectedOrigin) {
    throw new APIError("FORBIDDEN", { code: "INVALID_ORIGIN", message: "Invalid origin" });
  }
}

export function assertValidNewPassword(currentPassword: string, newPassword: string) {
  const problem = passwordProblem(newPassword);
  if (problem) throw new APIError("UNPROCESSABLE_ENTITY", { code: "VALIDATION_PASSWORD", message: problem });
  if (newPassword === currentPassword) {
    throw new APIError("UNPROCESSABLE_ENTITY", {
      code: "VALIDATION_PASSWORD",
      message: "Choose a password different from the current one.",
    });
  }
}

export const CURRENT_PASSWORD_INCORRECT = {
  code: "AUTH_CURRENT_PASSWORD_INCORRECT",
  message: "The current password is incorrect.",
};
