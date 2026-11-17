import { CameraWaiting, ModelLoading } from "@/components/game/camera-notice";
import { StepDots } from "@/components/ui/progress";
import type { LoadProgress } from "../engine/tracker";
import { LOADING_STEPS, loadingCopy } from "./copy";

/**
 * Between "Turn on camera" and the live view. The model downloads while the
 * browser asks for the camera, so the permission box gets the screen to
 * itself while it is open; after that, the real stage (and real megabytes).
 */
export function LoadingScreen({
  waitingForPermission,
  progress,
  modelReady,
}: {
  waitingForPermission: boolean;
  progress: LoadProgress | null;
  modelReady: boolean;
}) {
  const copy = loadingCopy(progress, modelReady);
  return (
    <section className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
      {waitingForPermission ? (
        <CameraWaiting />
      ) : (
        <div className="flex w-full flex-col items-center gap-6">
          <ModelLoading label={copy.label} detail={copy.detail} progress={copy.progress} />
          <StepDots total={LOADING_STEPS} current={copy.step} label="Getting ready" />
        </div>
      )}
    </section>
  );
}
