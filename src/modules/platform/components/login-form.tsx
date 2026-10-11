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
import { platformApi } from "../api";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
});
type Values = z.infer<typeof schema>;

export function PlatformLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      const { user } = await platformApi.login(email, password);
      router.replace(user.mustChangePassword ? "/change-password" : "/institutes");
    } catch (err) {
      // One message for every credential failure, so accounts can't be enumerated.
      if (err instanceof ApiError && err.status === 429) setError("Too many attempts. Wait a minute and try again.");
      else if (err instanceof ApiError && err.status === 0) setError(err.message);
      else setError("Invalid email or password.");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField id="email" required label="Email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="username" autoFocus aria-invalid={!!errors.email || undefined} {...form.register("email")} />
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

export function PlatformChangePassword() {
  const router = useRouter();
  return <ChangePasswordForm submit={platformApi.changePassword} onDone={() => router.replace("/institutes")} />;
}
