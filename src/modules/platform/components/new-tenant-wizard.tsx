"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { FormField } from "@/components/shared/form-field";
import { PasswordField } from "@/components/shared/password-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { passwordProblem } from "@/lib/password-rule";
import { cn } from "@/lib/utils";
import { MODULE_REGISTRY, closeModuleDependencies } from "@/server/core/modules/registry";
import { platformApi, type ModuleKey } from "../api";
import { platformKeys } from "../keys";
import { useInstituteUrl } from "./platform-shell";

const schema = z.object({
  name: z.string().trim().min(1, "Institute name is required.").max(150),
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/, "3–63 lowercase letters, digits or hyphens; no hyphen at either end."),
  modules: z.array(z.string()),
  ownerName: z.string().trim().min(1, "Owner name is required.").max(100),
  ownerEmail: z.email("Enter a valid email address."),
  temporaryPassword: z.string().superRefine((value, ctx) => {
    const problem = passwordProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  }),
});
type Values = z.infer<typeof schema>;

const STEPS = ["Institute", "Modules", "Owner", "Review"] as const;
const STEP_FIELDS: (keyof Values)[][] = [["name", "subdomain"], ["modules"], ["ownerName", "ownerEmail", "temporaryPassword"], []];
const OPTIONAL_MODULES = MODULE_REGISTRY.filter((m) => !m.alwaysOn);
const ALWAYS_ON = MODULE_REGISTRY.filter((m) => m.alwaysOn);

type SubdomainCheck = "idle" | "checking" | "available" | "taken" | "invalid" | "error";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function NewTenantWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const instituteUrl = useInstituteUrl();
  const [step, setStep] = useState(0);
  const [subdomainTouched, setSubdomainTouched] = useState(false);
  const [checkResult, setCheckResult] = useState<{ subdomain: string; state: SubdomainCheck } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; subdomain: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { name: "", subdomain: "", modules: [], ownerName: "", ownerEmail: "", temporaryPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const name = useWatch({ control: form.control, name: "name" });
  const subdomain = useWatch({ control: form.control, name: "subdomain" });
  const selected = useWatch({ control: form.control, name: "modules" }) as ModuleKey[];

  // Suggest a subdomain from the institute name until the admin edits it themselves.
  useEffect(() => {
    if (!subdomainTouched) form.setValue("subdomain", slugify(name));
  }, [name, subdomainTouched, form]);

  // A result only counts for the exact subdomain it was fetched for.
  const normalizedSubdomain = subdomain.trim().toLowerCase();
  const check: SubdomainCheck = !normalizedSubdomain
    ? "idle"
    : checkResult?.subdomain === normalizedSubdomain
      ? checkResult.state
      : "checking";

  useEffect(() => {
    if (!normalizedSubdomain) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await platformApi.checkSubdomain(normalizedSubdomain, controller.signal);
        setCheckResult({ subdomain: normalizedSubdomain, state: result.available ? "available" : (result.reason ?? "taken") });
      } catch {
        if (!controller.signal.aborted) setCheckResult({ subdomain: normalizedSubdomain, state: "error" });
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedSubdomain]);

  // No reset on close: the parent remounts the wizard on each open, so the fade-out never flashes step 1.
  function requestClose(next: boolean) {
    if (next) return onOpenChange(true);
    if (created && !copied) return setConfirmClose(true);
    onOpenChange(false);
  }

  async function next() {
    if (!(await form.trigger(STEP_FIELDS[step]))) return;
    if (step === 0 && check !== "available") return;
    setStep((s) => s + 1);
  }

  function toggleModule(key: ModuleKey, checked: boolean) {
    const current = new Set(selected);
    if (checked) closeModuleDependencies([key]).forEach((k) => current.add(k));
    else current.delete(key);
    form.setValue(
      "modules",
      [...current].filter((k) => OPTIONAL_MODULES.some((m) => m.key === k)),
      { shouldDirty: true },
    );
  }

  const requiredBy = (key: ModuleKey) =>
    OPTIONAL_MODULES.filter((m) => selected.includes(m.key) && m.dependsOn.includes(key)).map((m) => m.name);

  const submit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await platformApi.createTenant({
        name: values.name,
        subdomain: values.subdomain,
        starter_modules: values.modules as ModuleKey[],
        owner_name: values.ownerName,
        owner_email: values.ownerEmail,
        temporary_password: values.temporaryPassword,
      });
      await queryClient.invalidateQueries({ queryKey: platformKeys.tenants() });
      setCreated({ name: values.name, subdomain: values.subdomain, password: values.temporaryPassword });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't create the tenant. Please try again.");
    }
  });

  async function copyPassword() {
    if (!created) return;
    await navigator.clipboard.writeText(created.password);
    setCopied(true);
  }

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent className="sm:max-w-xl" onInteractOutside={(e) => e.preventDefault()}>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-success" /> {created.name} is ready
              </DialogTitle>
              <DialogDescription>Send these to the institute Owner through a channel you trust. No email is sent.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="surface-glass-item rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Institute address</p>
                <a href={instituteUrl(created.subdomain)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-sm text-primary-strong hover:underline">
                  {instituteUrl(created.subdomain)} <ExternalLink className="size-3" />
                </a>
              </div>
              <div className="surface-glass-item rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Owner&apos;s temporary password</p>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-base" data-testid="one-time-password">{created.password}</code>
                  <Button size="sm" variant="outline" onClick={copyPassword}>
                    {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              <p className="flex items-center gap-2 text-sm">
                <AlertTriangle className="size-4 shrink-0 text-warning" /> This password won&apos;t be shown again.
              </p>
              {confirmClose && (
                <div role="alert" className="flex flex-col gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span>You haven&apos;t copied the password. Close anyway?</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setConfirmClose(false)}>
                      Go back
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onOpenChange(false)}
                    >
                      Close without copying
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => requestClose(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={(e) => e.preventDefault()} noValidate>
            <DialogHeader>
              <DialogTitle>New institute</DialogTitle>
              <DialogDescription>
                Step {step + 1} of {STEPS.length} · {STEPS[step]}
              </DialogDescription>
            </DialogHeader>

            <ol className="my-4 grid grid-cols-4 gap-1" aria-label="Progress">
              {STEPS.map((label, i) => (
                <li key={label} aria-current={i === step ? "step" : undefined} className={cn("h-1.5 rounded-full bg-muted", i <= step && "bg-brand-gradient")}>
                  <span className="sr-only">{label}</span>
                </li>
              ))}
            </ol>

            <div className="min-h-64 space-y-4">
              {step === 0 && (
                <>
                  <FormField id="name" required label="Institute name" error={errors.name?.message}>
                    <Input id="name" autoFocus {...form.register("name")} aria-invalid={!!errors.name || undefined} />
                  </FormField>
                  <FormField
                    id="subdomain" required
                    label="Subdomain"
                    error={errors.subdomain?.message}
                    hint={subdomain ? <span className="font-mono">{instituteUrl(subdomain.toLowerCase())}</span> : "The institute's own address."}
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        id="subdomain"
                        className="font-mono"
                        {...form.register("subdomain", { onChange: () => setSubdomainTouched(true) })}
                        aria-invalid={!!errors.subdomain || check === "taken" || check === "invalid" || undefined}
                      />
                      <SubdomainStatus state={check} />
                    </div>
                  </FormField>
                </>
              )}

              {step === 1 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Pick the modules the institute starts with. Anything a module needs is added automatically.</p>
                  {ALWAYS_ON.map((m) => (
                    <ModuleOption key={m.key} id={m.key} label={m.name} checked disabled note="Always included" />
                  ))}
                  {OPTIONAL_MODULES.map((m) => {
                    const blockers = requiredBy(m.key);
                    return (
                      <ModuleOption
                        key={m.key}
                        id={m.key}
                        label={m.name}
                        checked={selected.includes(m.key)}
                        disabled={blockers.length > 0}
                        note={blockers.length ? `Required by ${blockers.join(", ")}` : undefined}
                        onChange={(checked) => toggleModule(m.key, checked)}
                      />
                    );
                  })}
                </div>
              )}

              {step === 2 && (
                <>
                  <FormField id="ownerName" required label="Owner name" error={errors.ownerName?.message}>
                    <Input id="ownerName" autoFocus {...form.register("ownerName")} aria-invalid={!!errors.ownerName || undefined} />
                  </FormField>
                  <FormField id="ownerEmail" required label="Owner email" error={errors.ownerEmail?.message} hint="The Owner signs in with this.">
                    <Input id="ownerEmail" type="email" {...form.register("ownerEmail")} aria-invalid={!!errors.ownerEmail || undefined} />
                  </FormField>
                  <FormField
                    id="temporaryPassword" required
                    label="Temporary password"
                    error={errors.temporaryPassword?.message}
                    hint="At least 8 characters, with a letter and a digit. The Owner must change it at first sign-in."
                  >
                    <Controller
                      control={form.control}
                      name="temporaryPassword"
                      render={({ field }) => (
                        <PasswordField id="temporaryPassword" value={field.value} onChange={field.onChange} onBlur={field.onBlur} withGenerate invalid={!!errors.temporaryPassword} />
                      )}
                    />
                  </FormField>
                </>
              )}

              {step === 3 && (
                <dl className="surface-glass-item grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-md border p-4 text-sm">
                  <dt className="text-muted-foreground">Institute</dt>
                  <dd>{form.getValues("name")}</dd>
                  <dt className="text-muted-foreground">Address</dt>
                  <dd className="font-mono break-all">{instituteUrl(form.getValues("subdomain").toLowerCase())}</dd>
                  <dt className="text-muted-foreground">Modules</dt>
                  <dd>{[...ALWAYS_ON, ...OPTIONAL_MODULES.filter((m) => selected.includes(m.key))].map((m) => m.name).join(", ")}</dd>
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd>
                    {form.getValues("ownerName")} · {form.getValues("ownerEmail")}
                  </dd>
                </dl>
              )}

              {submitError && step === 3 && (
                <p role="alert" className="text-sm text-destructive">
                  {submitError}
                </p>
              )}
            </div>

            <DialogFooter className="mt-4">
              {step > 0 && (
                <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)} disabled={isSubmitting}>
                  Back
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button type="button" onClick={next} disabled={step === 0 && check !== "available"}>
                  Next
                </Button>
              ) : (
                <Button type="button" variant="gradient" onClick={submit} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="animate-spin" />}
                  Create institute
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SubdomainStatus({ state }: { state: SubdomainCheck }) {
  const content: Record<SubdomainCheck, React.ReactNode> = {
    idle: null,
    checking: <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Checking" />,
    available: (
      <span className="flex items-center gap-1 text-success">
        <Check className="size-4" /> Available
      </span>
    ),
    taken: (
      <span className="flex items-center gap-1 text-destructive">
        <X className="size-4" /> Taken
      </span>
    ),
    invalid: (
      <span className="flex items-center gap-1 text-destructive">
        <X className="size-4" /> Not allowed
      </span>
    ),
    error: <span className="text-muted-foreground">Couldn&apos;t check</span>,
  };
  return (
    <span className="w-28 shrink-0 text-xs" aria-live="polite">
      {content[state]}
    </span>
  );
}

function ModuleOption({
  id,
  label,
  checked,
  disabled,
  note,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  note?: string;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={`module-${id}`} className={cn("surface-glass-item flex items-center gap-3 rounded-md border px-3 py-2.5", !disabled && "cursor-pointer hover:bg-accent/50")}>
      <Checkbox id={`module-${id}`} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange?.(v === true)} />
      <span className="flex-1 text-sm font-medium">{label}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </label>
  );
}
