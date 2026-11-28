import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";

// A DOM for this file only (happy-dom), taken away again after, so the other tests keep running without one.
GlobalRegistrator.register();
afterAll(() => GlobalRegistrator.unregister());

// The serwist window helper and the router, faked: a waiting version, and a pathname the test moves.
const listeners = new Map<string, (e: { isUpdate?: boolean }) => void>();
let skipped = 0;
const serwist = {
  addEventListener: (type: string, fn: (e: { isUpdate?: boolean }) => void) => listeners.set(type, fn),
  removeEventListener: (type: string) => listeners.delete(type),
  messageSkipWaiting: () => skipped++,
};
let pathname = "/map";
mock.module("@serwist/turbopack/react", () => ({ SerwistProvider: ({ children }: { children: ReactNode }) => children, useSerwist: () => ({ serwist }) }));
mock.module("next/navigation", () => ({ usePathname: () => pathname }));

describe("the quiet update", () => {
  let render: (path: string) => Promise<void>;
  let online = true;

  beforeAll(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
    const [{ act, createElement }, { createRoot }, { ServiceWorker }] = await Promise.all([import("react"), import("react-dom/client"), import("./ServiceWorker")]);
    const root = createRoot(document.createElement("div"));
    render = (path) => {
      pathname = path;
      return act(async () => root.render(createElement(ServiceWorker)));
    };
  });

  test("waits on a page change with no signal, and takes over at the next page change online", async () => {
    await render("/map");
    listeners.get("waiting")!({});
    online = false;
    await render("/routes/r1");
    expect(skipped).toBe(0);
    online = true;
    await render("/routes/r2");
    expect(skipped).toBe(1);
  });
});
