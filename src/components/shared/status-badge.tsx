import { Badge } from "@/components/ui/badge";

type Tone = "success" | "warning" | "info" | "destructive" | "secondary" | "outline";

const STATUSES: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "info" },
  ACTIVE: { label: "Active", tone: "success" },
  SUSPENDED: { label: "Suspended", tone: "warning" },
  DEACTIVATED: { label: "Deactivated", tone: "destructive" },
  DISABLED: { label: "Disabled", tone: "secondary" },
  FULFILLED: { label: "Fulfilled", tone: "success" },
  DISMISSED: { label: "Dismissed", tone: "secondary" },
  ENABLED: { label: "Enabled", tone: "success" },
};

export function StatusBadge({ status, label, tone }: { status: string; label?: string; tone?: Tone }) {
  const known = STATUSES[status];
  return (
    <Badge variant={tone ?? known?.tone ?? "outline"} data-status={status}>
      {label ?? known?.label ?? status}
    </Badge>
  );
}
