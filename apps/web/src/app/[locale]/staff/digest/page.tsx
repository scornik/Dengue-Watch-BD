"use client";

import { Suspense } from "react";
import { StaffGate } from "@/components/StaffGate";
import { DigestView } from "@/components/staff/DigestView";
import { canAdmin } from "@/lib/staff/useStaff";

export default function DigestPage() {
  return (
    <StaffGate allow={canAdmin}>
      {({ profile }) => (
        <Suspense>
          <DigestView profile={profile} />
        </Suspense>
      )}
    </StaffGate>
  );
}
