"use client";

import Image from "next/image";
import { Camera } from "lucide-react";
import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { CameraProblem, CameraPrompt, CameraWaiting } from "@/components/game/camera-notice";
import { cn } from "@/lib/cn";
import type { ExamplePhoto } from "./state";
import type { CameraState } from "./use-camera";

export const CAMERA_PHOTO_PRIVACY = "Photos stay in this browser tab. Nothing is uploaded, and Next player deletes them.";

/**
 * Take example photos with the camera. Each photo becomes a JPEG in memory
 * (a blob URL), never uploaded, and is gone after Next player.
 */
export function CaptureModal({
  label,
  none,
  photos,
  full,
  camera,
  videoRef,
  onWelcome,
  onRetry,
  onTake,
  onClose,
}: {
  label: string;
  /** The "No object" group: photos of the empty background. */
  none: boolean;
  /** Camera photos already taken for this group. */
  photos: ExamplePhoto[];
  full: boolean;
  camera: CameraState;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The visitor accepted the explanation: start the camera. */
  onWelcome: () => void;
  onRetry: () => void;
  /** Take a photo; true when a frame was captured. */
  onTake: () => boolean;
  onClose: () => void;
}) {
  const [flash, setFlash] = useState(0);
  const status = camera;
  const live = status.status === "live";

  const take = () => {
    if (onTake()) setFlash((n) => n + 1);
  };

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={none ? "Take photos with no object" : `Take photos: ${label}`}
      description={
        none
          ? "Take every object out of the picture and photograph what is left, so it learns what nothing looks like."
          : "Hold it up to the camera. Try a few angles and backgrounds."
      }
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>
            Close camera
          </Button>
          {live ? (
            <Button variant="game" size="lg" icon={<Camera />} disabled={full} onClick={take}>
              Take photo
            </Button>
          ) : null}
        </>
      }
    >
      {status.status === "off" ? (
        <CameraPrompt
          text={none ? "Each photo you take becomes one more example of no object." : `Each photo you take becomes one more ${label} example.`}
          privacy={CAMERA_PHOTO_PRIVACY}
          onAllow={onWelcome}
        />
      ) : status.status === "waiting" ? (
        <CameraWaiting />
      ) : status.status === "error" ? (
        <CameraProblem issue={status.issue} onRetry={onRetry} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-sunken">
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              aria-hidden
              className={cn("size-full object-cover", status.mirrored && "-scale-x-100")}
            />
            {flash > 0 ? (
              <span
                key={flash}
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-white opacity-0 transition-opacity duration-200 ease-out starting:opacity-40"
              />
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <p aria-live="polite" className="type-small shrink-0 tabular-nums text-fg-muted">
              {full ? "That’s the most it takes." : photos.length === 1 ? "1 photo taken" : `${photos.length} photos taken`}
            </p>
            {photos.length ? (
              <ul className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto">
                {photos.slice(-8).map((photo) => (
                  <li key={photo.id} className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-sunken">
                    <Image src={photo.url} alt="" fill unoptimized sizes="48px" className="object-cover" />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
