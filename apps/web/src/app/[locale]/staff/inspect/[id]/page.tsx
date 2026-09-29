"use client";

import { useParams } from "next/navigation";
import { StaffGate } from "@/components/StaffGate";
import { InspectorSite } from "@/components/staff/InspectorSite";
import { canInspect } from "@/lib/staff/useStaff";

export default function InspectSitePage() {
  const { id } = useParams<{ id: string }>();
  return <StaffGate allow={canInspect}>{({ profile }) => <InspectorSite siteId={id} userId={profile.id} />}</StaffGate>;
}
