import type { Metadata } from "next";
import { EventsList } from "@/components/EventsList";

export const metadata: Metadata = { title: "Past events · Check-in" };

export default function Page() {
  return <EventsList />;
}
