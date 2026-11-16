import { redirect } from "next/navigation";

/** The banners are part of the home page's screen now (2026-11-16); old links and bookmarks land there. */
export default function AdminBannersPage() {
  redirect("/admin/pages/home#banners");
}
