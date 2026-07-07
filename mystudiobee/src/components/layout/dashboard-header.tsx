import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { BackButton } from "@/components/layout/back-button";

export function DashboardHeader({
  title,
  backHref,
  children,
}: {
  title?: string;
  backHref?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-5">
      <SidebarTrigger className="-ml-1 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" />
      <Separator orientation="vertical" className="!h-4 mr-0.5 bg-border sm:mr-1" />
      {backHref && <BackButton href={backHref} />}

      {title && (
        <h1 className="min-w-0 shrink truncate font-heading text-sm font-semibold tracking-[-0.01em] text-foreground">
          {title}
        </h1>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">{children}</div>
    </header>
  );
}
