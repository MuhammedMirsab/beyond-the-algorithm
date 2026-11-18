import { CameraOff, MonitorX } from "lucide-react";
import { CameraProblem } from "@/components/game/camera-notice";
import { Notice } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import type { ViewfinderIssue } from "../engine/camera";

/** Finger frame's two issues that the shared camera copy doesn't cover. */
const OWN_COPY = {
  webgl: {
    title: "This browser can't draw the filters",
    text: "Finger frame draws its filters on the graphics card with WebGL 2. Turn on hardware acceleration in the browser settings, or open the arcade in the latest Chrome or Edge.",
  },
  stopped: {
    title: "The camera stopped",
    text: "It may have been unplugged or taken by another app. Check the camera, then try again.",
  },
} as const;

/** Trying again can't fix these: the page or the browser has to change. */
const NO_RETRY: ReadonlySet<ViewfinderIssue> = new Set(["insecure", "unsupported"]);

export function ProblemScreen({ issue, onRetry }: { issue: ViewfinderIssue; onRetry: () => void }) {
  const retry = NO_RETRY.has(issue) ? undefined : onRetry;
  return (
    <section className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
      {issue === "webgl" || issue === "stopped" ? (
        <Notice
          icon={issue === "webgl" ? <MonitorX /> : <CameraOff />}
          title={OWN_COPY[issue].title}
          actions={
            <Button variant="primary" size="lg" onClick={onRetry}>
              Try again
            </Button>
          }
        >
          <p>{OWN_COPY[issue].text}</p>
        </Notice>
      ) : (
        <CameraProblem issue={issue} onRetry={retry} />
      )}
    </section>
  );
}
