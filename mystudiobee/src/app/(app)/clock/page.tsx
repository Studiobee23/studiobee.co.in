import { redirect } from "next/navigation";

// The clock page was folded into /time-performance (Clock tab), but the PWA
// manifest's start_url is still /clock, and installed copies keep launching it.
export default function ClockPage() {
  redirect("/time-performance");
}
