import type { ReactNode } from "react";
import { RouteFade } from "@/components/RouteFade";

// Drawn again for every page the visitor moves to (unlike a layout), so the page area can fade in each time. No wrapper element:
// the page keeps exactly the structure it had.
export default function PublicTemplate({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <RouteFade />
    </>
  );
}
