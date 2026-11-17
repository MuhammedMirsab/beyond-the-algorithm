"use client";

import { QRCodeSVG } from "qrcode.react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

const subscribe = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => null;

/**
 * "Scan to play on your phone": a QR code for the current site + path.
 * Renders nothing on the server (the origin is only known in the browser).
 */
export function PhoneHandoff({
  path,
  title = "Play on your phone",
  text = "Point your phone camera at the code.",
  size = 132,
  className,
}: {
  path: string;
  title?: string;
  text?: string;
  size?: number;
  className?: string;
}) {
  const origin = useSyncExternalStore(subscribe, getOrigin, getServerOrigin);
  const url = origin ? `${origin}${path}` : null;
  return (
    <div className={cn("flex items-center gap-4 rounded-lg bg-surface p-3 pr-5 shadow-ring", className)}>
      <div className="grid shrink-0 place-items-center rounded-md bg-white p-2" style={{ width: size + 16, height: size + 16 }}>
        {url ? (
          <QRCodeSVG value={url} size={size} level="M" marginSize={0} bgColor="#ffffff" fgColor="#0e1015" title={`QR code for ${url}`} />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="type-body font-semibold text-fg">{title}</span>
        <span className="type-small text-fg-subtle">{text}</span>
        {url ? <span className="type-caption break-all text-fg-faint">{url.replace(/^https?:\/\//, "")}</span> : null}
      </div>
    </div>
  );
}
