"use client";

import { UserRoundPlus } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { track } from "@/lib/play-tracker";

/**
 * Every game's "Next player": forgets this visitor and starts fresh. One icon
 * and one look across the arcade, so booth staff and visitors find it at once.
 */
export const NextPlayerIcon = UserRoundPlus;

/** The header version: the one filled header action. Label from 640px, icon only below. */
export function NextPlayerButton({ onClick: reset }: { onClick: () => void }) {
  // Analytics: this visitor's session ends here, the next one starts.
  const onClick = () => {
    track.nextPlayer();
    reset();
  };
  return (
    <>
      <IconButton className="sm:hidden" label="Next player" icon={<UserRoundPlus />} onClick={onClick} />
      <Button className="hidden sm:inline-flex" variant="secondary" icon={<UserRoundPlus />} onClick={onClick}>
        Next player
      </Button>
    </>
  );
}
