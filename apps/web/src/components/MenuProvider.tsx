"use client";

import { usePathname } from "next/navigation";
import { preloadMotion } from "@/lib/motion";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

// Whether the menu panel is open. The menu has two buttons that open it (the pill at the top of the page on a
// phone, an item in the side rail on a wide screen), so the state lives above both. The rail's button is shared
// too: on a wide screen the panel opens as a popover beside it.
const MenuContext = createContext<{ open: boolean; setOpen: (open: boolean) => void; railButton: RefObject<HTMLButtonElement | null> }>({
  open: false,
  setOpen: () => {},
  railButton: { current: null },
});

export function MenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // GSAP (for the menu's and other exits) loads once the page is idle, never in front of the content.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    idle(() => preloadMotion());
  }, []);
  const railButton = useRef<HTMLButtonElement>(null);
  // Going to another page closes the menu. Adjusted here, in the component that owns the state, while
  // rendering (the pattern React recommends); doing it from the header would update this component mid-render.
  const pathname = usePathname();
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }
  return <MenuContext.Provider value={{ open, setOpen, railButton }}>{children}</MenuContext.Provider>;
}

export const useMenu = () => useContext(MenuContext);
