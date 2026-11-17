import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge does not know our custom utilities, so teach it which ones
 * conflict. Without this, `cn("type-body", "type-small")` would keep both.
 */
const twMerge = extendTailwindMerge<"type-role">({
  extend: {
    classGroups: {
      "type-role": [
        {
          type: [
            "display-1",
            "display-2",
            "title-1",
            "title-2",
            "title-3",
            "body-lg",
            "body",
            "small",
            "caption",
            "label",
            "score",
          ],
        },
      ],
      shadow: [{ shadow: ["ring", "ring-strong", "float", "tile"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
