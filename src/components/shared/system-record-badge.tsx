import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Marks a seeded, locked row (shifts/groups' `is_system`) — can't be edited or deleted. */
export function SystemRecordBadge() {
  return (
    <Badge variant="secondary" className="gap-1">
      <Lock className="size-3" /> Default
    </Badge>
  );
}
