"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-14" → a local Date (no time-zone shift), or undefined. */
export function parseIsoDate(value: string | undefined | null): Date | undefined {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "14 Oct 2026": the product's display format for dates. */
export function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A date field with a calendar pop-up. The value is the same `YYYY-MM-DD` string the native date input and the API
 * use, so it can replace `<Input type="date">` without changing any form code. Phones may keep the native input,
 * which opens the phone's own picker.
 */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  min,
  max,
  disabled,
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseIsoDate(value);
  const from = parseIsoDate(min);
  const to = parseIsoDate(max);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          className={cn("w-full justify-start bg-card font-normal", !selected && "text-muted-foreground", className)}
        >
          <CalendarDays className="text-muted-foreground" />
          {selected ? formatDisplayDate(selected) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? to}
          captionLayout="dropdown"
          startMonth={from ?? new Date(2000, 0)}
          endMonth={to ?? new Date(new Date().getFullYear() + 5, 11)}
          disabled={[...(from ? [{ before: from }] : []), ...(to ? [{ after: to }] : [])]}
          onSelect={(d) => {
            if (d) onChange(toIsoDate(d));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
