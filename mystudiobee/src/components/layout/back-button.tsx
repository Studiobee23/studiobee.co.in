import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function BackButton({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="-ml-1 flex shrink-0 items-center gap-1 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      title={label}
    >
      <ArrowLeft className="h-4 w-4" />
    </Link>
  );
}
