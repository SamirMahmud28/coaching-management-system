"use client";

import { Check, Copy, Eye, EyeOff, Wand2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateTemporaryPassword } from "@/lib/temporary-password";

export function PasswordField({
  id,
  value,
  onChange,
  withGenerate = false,
  autoComplete = "new-password",
  invalid,
  ...rest
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  withGenerate?: boolean;
  autoComplete?: string;
  invalid?: boolean;
} & Omit<React.ComponentProps<"input">, "value" | "onChange" | "type">) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={invalid || undefined}
          className="pr-10 font-mono"
          {...rest}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-0.5 -translate-y-1/2"
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      {withGenerate && (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onChange(generateTemporaryPassword());
              setVisible(true);
            }}
          >
            <Wand2 /> Generate
          </Button>
          <Button type="button" variant="outline" size="icon" aria-label="Copy password" disabled={!value} onClick={copy}>
            {copied ? <Check /> : <Copy />}
          </Button>
        </>
      )}
    </div>
  );
}
