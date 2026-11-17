"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { DatasetManifest } from "../engine/dataset";

const link =
  "underline decoration-fg-faint underline-offset-2 transition-colors duration-150 hover:text-fg hover:decoration-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg";

/**
 * Attribution for every library photo: title, author (when Commons lists
 * one), licence and source page. The list renders only when opened.
 */
export function PhotoCredits({ manifest }: { manifest: DatasetManifest }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="group mx-auto w-full max-w-[69rem] px-4 pb-10 sm:px-6 lg:px-8"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary
        className="type-small inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full py-2 font-semibold text-fg-subtle transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg [&::-webkit-details-marker]:hidden"
      >
        Photo credits
        <ChevronDown aria-hidden className="size-4 transition-transform duration-200 ease-out group-open:rotate-180" />
      </summary>
      {open ? (
        <div className="mt-3 flex flex-col gap-6 rounded-lg bg-surface p-5 shadow-ring">
          <p className="type-small max-w-[40rem] text-fg-subtle">
            All {manifest.photos.length} photos come from {manifest.source}. Each one keeps its own licence.
          </p>
          {manifest.categories.map((category) => (
            <section key={category.id} aria-labelledby={`credits-${category.id}`} className="flex flex-col gap-2">
              <h3 id={`credits-${category.id}`} className="type-label text-fg-subtle">
                {category.label}
              </h3>
              <ul className="grid gap-x-8 gap-y-1.5 md:grid-cols-2">
                {manifest.photos
                  .filter((p) => p.category === category.id)
                  .map((p) => (
                    <li key={p.id} className="type-caption min-w-0 text-fg-subtle">
                      <a href={p.sourceUrl} target="_blank" rel="noreferrer" className={link}>
                        {p.title}
                      </a>
                      {p.author ? ` by ${p.author}` : null}
                      {", "}
                      {p.licenseUrl ? (
                        <a href={p.licenseUrl} target="_blank" rel="noreferrer" className={link}>
                          {p.license}
                        </a>
                      ) : (
                        p.license
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </details>
  );
}
