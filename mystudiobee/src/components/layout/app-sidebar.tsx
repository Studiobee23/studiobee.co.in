"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  Receipt,
  ScrollText,
  UserCog,
  Calculator,
  LogOut,
  FolderOpen,
  CheckSquare,
  BarChart2,
  PieChart,
  Package,
  Clock,
  FileStack,
  Layers,
  Trash2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/profile";

type NavEntry = { title: string; href: string; icon: React.ComponentType<{ className?: string }> };

const workspaceNav: NavEntry[] = [{ title: "Dashboard", href: "/", icon: LayoutDashboard }];
const crmNav: NavEntry[] = [{ title: "Clients", href: "/clients", icon: Users }];
const projectNav: NavEntry[] = [{ title: "Projects", href: "/projects", icon: FolderOpen }];
const taskNav: NavEntry[] = [{ title: "Tasks", href: "/tasks", icon: CheckSquare }];
const clockNav: NavEntry[] = [{ title: "Clock In", href: "/clock", icon: Clock }];
const billingNav: NavEntry[] = [
  { title: "Quotes", href: "/quotes", icon: FileText },
  { title: "Proforma Invoices", href: "/proformas", icon: FileStack },
  { title: "Invoices", href: "/invoices", icon: Receipt },
  { title: "Receipts", href: "/receipts", icon: ScrollText },
];
const adminNav: NavEntry[] = [
  { title: "Team", href: "/admin/team", icon: UserCog },
  { title: "Services", href: "/admin/services", icon: Layers },
  { title: "Cost Model", href: "/admin/cost-model", icon: Calculator },
  { title: "Profit Split", href: "/admin/profit-split", icon: PieChart },
  { title: "Equipment", href: "/admin/equipment", icon: Package },
];
const reportNav: NavEntry[] = [
  { title: "Reports", href: "/reports", icon: BarChart2 },
  { title: "Time Log", href: "/reports/time", icon: Clock },
];
const binNav: NavEntry[] = [{ title: "Bin", href: "/bin", icon: Trash2 }];

const GROUP_LABEL_CLASS =
  "mb-0 mt-1 px-3 h-4 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30 leading-none";

function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavItem({ item, active }: { item: NavEntry; active: boolean }) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active}>
        <Link
          href={item.href}
          onClick={() => {
            if (isMobile) setOpenMobile(false);
          }}
          className={`group/nav relative flex items-center gap-2.5 rounded-md px-3 py-[3px] font-heading text-[13px] tracking-[0.04em] transition-all duration-150 ${
            active
              ? "!bg-white/12 !text-white font-medium"
              : "!text-white/55 font-normal hover:!text-white/85 hover:!bg-white/6"
          }`}
        >
          {active && (
            <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
          )}
          <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function Group({ label, items, pathname }: { label?: string; items: NavEntry[]; pathname: string }) {
  if (items.length === 0) return null;
  return (
    <SidebarGroup className={label ? "mt-1" : undefined}>
      {label && <SidebarGroupLabel className={GROUP_LABEL_CLASS}>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu className="space-y-0">
          {items.map((item) => (
            <NavItem key={item.href} item={item} active={isNavActive(pathname, item.href)} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar({
  displayName,
  email,
  role,
}: {
  displayName: string;
  email: string;
  role: Role;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isOwnerOrAdmin = role === "owner" || role === "admin";
  const isBilling = isOwnerOrAdmin || role === "manager";

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = (displayName || email || "U").charAt(0).toUpperCase();

  return (
    <Sidebar className="bg-gradient-blue">
      <SidebarHeader className="border-b border-white/8 px-5 py-2.5">
        <Link href="/" className="inline-flex items-center">
          <Image src="/studiobee-white.png" alt="StudioBee" width={120} height={30} />
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3 py-1.5">
        <Group items={workspaceNav} pathname={pathname} />
        {isBilling && <Group label="CRM" items={crmNav} pathname={pathname} />}
        <Group label="Projects" items={projectNav} pathname={pathname} />
        <Group label="Tasks" items={taskNav} pathname={pathname} />
        <Group label="Time" items={clockNav} pathname={pathname} />
        {isBilling && <Group label="Billing" items={billingNav} pathname={pathname} />}
        {isOwnerOrAdmin && <Group label="Admin" items={adminNav} pathname={pathname} />}
        {isOwnerOrAdmin && <Group label="Insights" items={reportNav} pathname={pathname} />}
        {isOwnerOrAdmin && <Group items={binNav} pathname={pathname} />}
      </SidebarContent>

      <SidebarFooter className="border-t border-white/8 px-3 py-1.5">
        <div className="flex w-full items-center gap-3 rounded-lg px-2 py-0.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white/75">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium leading-tight text-white/85">
              {displayName || email}
            </p>
            <p className="truncate text-[10px] capitalize leading-tight text-white/30">{role}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-md p-1.5 transition-colors hover:bg-white/10"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5 text-white/40 transition-colors hover:text-white/80" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
