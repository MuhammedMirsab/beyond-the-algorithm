import type { Metadata } from "next";
import { IntroPreview } from "./intro-preview";

export const metadata: Metadata = {
  title: "Intro preview",
  robots: { index: false },
};

export default function IntroPreviewPage() {
  return <IntroPreview />;
}
