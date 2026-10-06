import type { Metadata } from "next";
import { EventDetail } from "@/components/EventDetail";

export const metadata: Metadata = { title: "Event · Check-in" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventDetail id={id} />;
}
