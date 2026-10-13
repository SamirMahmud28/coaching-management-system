"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

// The website's admission enquiry form (D22, D129). The hidden "website" field and the time the form was opened let the
// server drop bot submissions; the server answers the same either way.

const field = "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-brand)]";

export function EnquiryForm({ courses, card }: { courses: { id: string; name: string }[]; card: string }) {
  const startedAt = useRef<number | null>(null);
  const [values, setValues] = useState({ name: "", mobile: "", course_id: "", message: "", website: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (name: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    startedAt.current ??= Date.now();
    setValues((v) => ({ ...v, [name]: e.target.value }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const missing: Record<string, string> = {};
    if (!values.name.trim()) missing.name = "Please write the student's name.";
    if (!values.mobile.trim()) missing.mobile = "Please write a mobile number.";
    setErrors(missing);
    setFailure(null);
    if (Object.keys(missing).length) return;
    setSending(true);
    try {
      const res = await fetch("/api/public/enquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: values.name, mobile: values.mobile, course_id: values.course_id || null, message: values.message || null, website: values.website || null, started_at: startedAt.current,
        }),
      });
      if (res.ok) {
        setSent(true);
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { message?: string; details?: { field?: string } } } | null;
      const fieldName = body?.error?.details?.field;
      const message = body?.error?.message ?? "Something went wrong. Please try again, or call us.";
      if (fieldName === "mobile" || fieldName === "name" || fieldName === "message") setErrors({ [fieldName]: message });
      else if (fieldName === "courseId") setErrors({ course_id: message });
      else setFailure(message);
    } catch {
      setFailure("Couldn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div role="status" data-testid="enquiry-sent" className={cn("flex flex-col items-center gap-3 p-8 text-center", card)}>
        <CheckCircle2 aria-hidden className="size-10 text-[var(--site-brand)]" />
        <p className="text-lg font-semibold">Thank you! Your enquiry has been sent.</p>
        <p className="text-sm text-muted-foreground">We&apos;ll call you on the number you gave us.</p>
      </div>
    );
  }

  const error = (name: string) =>
    errors[name] && (
      <p id={`enq-${name}-error`} className="text-xs text-destructive">
        {errors[name]}
      </p>
    );

  return (
    <form onSubmit={submit} noValidate className={cn("space-y-4 p-6", card)} aria-label="Admission enquiry">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="enq-name" className="text-sm font-medium">
            Student&apos;s name <span className="text-destructive">*</span>
          </label>
          <input id="enq-name" className={field} autoComplete="name" maxLength={100} value={values.name} onChange={set("name")} aria-invalid={!!errors.name} aria-describedby={errors.name ? "enq-name-error" : undefined} />
          {error("name")}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="enq-mobile" className="text-sm font-medium">
            Mobile number <span className="text-destructive">*</span>
          </label>
          <input id="enq-mobile" className={field} type="tel" inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" maxLength={20} value={values.mobile} onChange={set("mobile")} aria-invalid={!!errors.mobile} aria-describedby={errors.mobile ? "enq-mobile-error" : undefined} />
          {error("mobile")}
        </div>
      </div>
      {courses.length > 0 && (
        <div className="space-y-1.5">
          <label htmlFor="enq-course" className="text-sm font-medium">
            Course
          </label>
          <select id="enq-course" className={field} value={values.course_id} onChange={set("course_id")}>
            <option value="">Not sure yet</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {error("course_id")}
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="enq-message" className="text-sm font-medium">
          Message
        </label>
        <textarea id="enq-message" className={field} rows={4} maxLength={1000} placeholder="Class, preferred batch time, or any question" value={values.message} onChange={set("message")} />
        {error("message")}
      </div>
      {/* Hidden from people; bots that fill every field give themselves away. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="enq-website">Website</label>
        <input id="enq-website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
      </div>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
      <button type="submit" disabled={sending} className="inline-flex items-center gap-2 rounded-md bg-[var(--site-brand)] px-5 py-2.5 text-sm font-medium text-[var(--site-on-brand)] hover:opacity-90 disabled:opacity-60">
        {sending && <Loader2 aria-hidden className="size-4 animate-spin" />} Send enquiry
      </button>
    </form>
  );
}
