import { redirect } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getCurrentProfile } from "@/lib/profile";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <SidebarProvider>
      <AppSidebar displayName={profile.display_name} email={profile.email} role={profile.role} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
