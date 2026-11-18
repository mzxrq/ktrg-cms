import { redirect } from "next/navigation";

// The trial of the scrolling journey (#605) became the home page itself on 2026-11-18; a link someone was sent still lands there.
export default function HomeTrialPage() {
  redirect("/");
}
