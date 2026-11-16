"use client";

// Every native modal <dialog> in the app (confirmations, notices, pickers, the stamp pop-ups) rises and fades in,
// and fades out when it closes, without each one carrying its own code. A <dialog> hides the moment close() runs, so
// close() is wrapped to play the leave first; Escape is turned into the same close. The dimmed backdrop fades with it
// (the `--backdrop-o` variable read by `dialog::backdrop` in globals.css). With the level Off, or before GSAP has
// loaded, everything behaves as the browser does by itself. A dialog that a component removes from the page while it
// is open (instead of closing it) just disappears, as before.

import { ENTER_S, LEAVE_S, enter, getGsap, leave, motionLevel } from "./motion";

const leaving = new WeakMap<HTMLDialogElement, () => void>();
let installed = false;

function backdrop(el: HTMLDialogElement, to: 0 | 1) {
  const g = getGsap();
  if (!g || motionLevel() === "off") return;
  if (to === 1) g.fromTo(el, { "--backdrop-o": 0 }, { "--backdrop-o": 1, duration: ENTER_S, ease: "power2.out", clearProps: "--backdrop-o", overwrite: "auto" });
  else g.to(el, { "--backdrop-o": 0, duration: LEAVE_S, ease: "power2.in", overwrite: "auto" });
}

export function installDialogMotion(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const proto = HTMLDialogElement.prototype;
  const nativeShowModal = proto.showModal;
  const nativeClose = proto.close;

  proto.showModal = function (this: HTMLDialogElement) {
    const stop = leaving.get(this);
    if (stop) {
      // Opened again while it was still leaving: it never closed, so bring it back.
      stop();
      leaving.delete(this);
      enter(this, "rise");
      backdrop(this, 1);
      return;
    }
    nativeShowModal.call(this);
    enter(this, "rise");
    backdrop(this, 1);
  };

  function animatedClose(el: HTMLDialogElement, returnValue?: string) {
    if (!el.open) return nativeClose.call(el, returnValue);
    if (leaving.has(el)) return; // already on its way out
    if (!getGsap() || motionLevel() === "off") return nativeClose.call(el, returnValue);
    backdrop(el, 0);
    const stop = leave(el, "rise", () => {
      leaving.delete(el);
      nativeClose.call(el, returnValue);
      el.inert = false;
      getGsap()?.set(el, { clearProps: "opacity,transform,--backdrop-o" });
    });
    leaving.set(el, stop);
  }
  proto.close = function (this: HTMLDialogElement, returnValue?: string) {
    animatedClose(this, returnValue);
  };

  // Escape: the browser would close at once, so it is stopped and turned into the animated close.
  document.addEventListener(
    "cancel",
    (e) => {
      const el = e.target;
      if (el instanceof HTMLDialogElement && el.open && (leaving.has(el) || (getGsap() && motionLevel() !== "off"))) {
        e.preventDefault();
        el.close();
      }
    },
    true,
  );
}
