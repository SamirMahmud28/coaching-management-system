import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FilterBar({
  children,
  onClear,
  canClear,
}: {
  children: React.ReactNode;
  onClear?: () => void;
  canClear?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {children}
      {onClear && canClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X /> Clear filters
        </Button>
      )}
    </div>
  );
}
