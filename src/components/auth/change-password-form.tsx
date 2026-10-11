"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { FormField } from "@/components/shared/form-field";
import { PasswordField } from "@/components/shared/password-field";
import { Button } from "@/components/ui/button";
import { passwordProblem } from "@/lib/password-rule";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().superRefine((value, ctx) => {
      const problem = passwordProblem(value);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "The passwords don't match." })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a password different from the current one." });

type Values = z.infer<typeof schema>;

export function ChangePasswordForm({
  submit,
  onDone,
}: {
  submit: (currentPassword: string, newPassword: string) => Promise<unknown>;
  onDone: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await submit(values.currentPassword, values.newPassword);
      onDone();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Couldn't change your password. Please try again.");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {(["currentPassword", "newPassword", "confirmPassword"] as const).map((name) => (
        <FormField
          key={name}
          id={name}
          label={{ currentPassword: "Current (temporary) password", newPassword: "New password", confirmPassword: "Confirm new password" }[name]}
          hint={name === "newPassword" ? "At least 8 characters, with a letter and a digit." : undefined}
          error={errors[name]?.message}
        >
          <Controller
            control={form.control}
            name={name}
            render={({ field }) => (
              <PasswordField
                id={name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                autoComplete={name === "currentPassword" ? "current-password" : "new-password"}
                invalid={!!errors[name]}
              />
            )}
          />
        </FormField>
      ))}
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        Change password
      </Button>
    </form>
  );
}
