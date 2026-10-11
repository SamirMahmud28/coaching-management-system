"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { FormField } from "@/components/shared/form-field";
import { PasswordField } from "@/components/shared/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-client";
import { instituteApi } from "../api";

const schema = z.object({
  identifier: z.string().trim().min(1, "Enter your email, mobile number or student ID."),
  password: z.string().min(1, "Enter your password."),
});
type Values = z.infer<typeof schema>;

export function InstituteSignInForm({ inactive = false }: { inactive?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(inactive ? "This institute's account isn't active. Contact the institute office." : null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { identifier: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ identifier, password }) => {
    setError(null);
    try {
      const { user } = await instituteApi.signIn(identifier, password);
      router.replace(user.mustChangePassword ? "/change-password" : "/app");
    } catch (err) {
      if (err instanceof ApiError && err.code === "TENANT_INACTIVE") setError("This institute's account isn't active. Contact the institute office.");
      else if (err instanceof ApiError && err.status === 429) setError("Too many attempts. Wait a minute and try again.");
      else if (err instanceof ApiError && err.status === 0) setError(err.message);
      // One message for every credential failure, so accounts can't be enumerated.
      else setError("Invalid sign-in details or password.");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField id="identifier" required label="Email, mobile number or student ID" error={errors.identifier?.message}>
        <Input id="identifier" autoComplete="username" autoFocus aria-invalid={!!errors.identifier || undefined} {...form.register("identifier")} />
      </FormField>
      <FormField id="password" required label="Password" error={errors.password?.message}>
        <Controller
          control={form.control}
          name="password"
          render={({ field }) => (
            <PasswordField id="password" value={field.value} onChange={field.onChange} onBlur={field.onBlur} autoComplete="current-password" invalid={!!errors.password} />
          )}
        />
      </FormField>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" variant="gradient" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        Sign in
      </Button>
    </form>
  );
}

export function InstituteChangePassword() {
  const router = useRouter();
  return <ChangePasswordForm submit={instituteApi.changePassword} onDone={() => router.replace("/app")} />;
}
