import { Check, X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";

/** "Yes" or "No" with a tick or a cross, so the answer never rests on colour. */
export function AnswerChip({ yes, className }: { yes: boolean; className?: string }) {
  return (
    <Chip icon={yes ? <Check /> : <X />} className={cn("text-fg", className)}>
      {yes ? "Yes" : "No"}
    </Chip>
  );
}
