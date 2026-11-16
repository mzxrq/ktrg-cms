import type { ReactNode } from "react";
import { RouteFade } from "@/components/RouteFade";

// The same soft page change as the visitor side (see (public)/template.tsx).
export default function AdminTemplate({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <RouteFade />
    </>
  );
}
