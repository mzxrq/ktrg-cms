import type { ReactNode } from "react";
import { AdminProfileMenu } from "./AdminProfileMenu";
import { AdminFrame, SidebarToggle } from "./AdminFrame";
import { PublicSiteLink } from "./PublicSiteLink";
import { AdminNav } from "./AdminNav";

/** Runs before the page paints: the admin screens are light unless dark was chosen, so a dark device does not flash dark first. */
const adminLightScript = "if(!document.documentElement.dataset.theme)document.documentElement.dataset.theme='light'";

// The frame of every admin page: a menu on the left (folded behind a button on a narrow screen) that ends with who is signed
// in, the language and the theme, and the page itself. Its top holds the way to the same page on the site visitors see.
export function AdminShell({ name, avatarUrl = null, role, lists, children }: { name: string | null; avatarUrl?: string | null; role: "editor" | "admin" | null; lists: { key: string; title: string }[]; children: ReactNode }) {
  return (
    <AdminFrame
      aside={
        <>
          {/* The site link left of the fold button; folded, they stack. */}
          <div className="flex items-center gap-2 lg:mb-3 lg:group-data-[folded=true]:flex-col">
            <PublicSiteLink />
            <SidebarToggle />
          </div>
          <AdminNav lists={lists} isAdmin={role === "admin"} footer={null} />
          {/* Always in sight: in the top bar on a phone, at the foot of the menu on a wide screen. */}
          <div className="ml-auto lg:sticky lg:bottom-0 lg:z-10 lg:ml-0 lg:mt-auto lg:border-t lg:border-line lg:bg-paper lg:py-3 lg:group-data-[folded=true]:py-2">
            <AdminProfileMenu name={name} avatarUrl={avatarUrl} role={role} />
          </div>
          {/* Light before the first paint (admin screens do not follow the device); see AdminProfileMenu. */}
          <script dangerouslySetInnerHTML={{ __html: adminLightScript }} />
        </>
      }
    >
      <main id="main" className="px-4 py-6 lg:px-8">
        {children}
      </main>
    </AdminFrame>
  );
}
