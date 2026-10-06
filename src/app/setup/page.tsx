import type { Metadata } from "next";
import { SetupApp } from "@/components/SetupApp";

export const metadata: Metadata = { title: "Setup · Check-in" };

export default function Page() {
  return <SetupApp />;
}
