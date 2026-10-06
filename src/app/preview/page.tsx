import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { PhonePreview } from "@/components/PhonePreview";

export const metadata: Metadata = {
  title: "Your badge",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#09090b", width: "device-width", initialScale: 1 };

export default function Page() {
  return (
    <Suspense>
      <PhonePreview />
    </Suspense>
  );
}
