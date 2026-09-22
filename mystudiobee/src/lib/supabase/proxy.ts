import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminTier, type Role } from "@/lib/role";

const PUBLIC_PATHS = ["/login", "/accept-invite", "/auth/callback"];
const ADMIN_ONLY_PREFIXES = ["/admin"];
// An anonymous *client* opens these with no Supabase session at all, ever — the
// per-agreement `token` in the URL is the entire authorization boundary (see
// migration 0045_nda_agreements.sql's RLS comment). PUBLIC_PATHS below only
// skips the *redirect*, still running the full session/profile lookup; these
// need the session check skipped entirely, since there's no cookie to look up.
const NO_SESSION_PATHS = ["/nda", "/api/nda"];

export async function updateSession(request: NextRequest) {
  if (NO_SESSION_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !profile.active) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "account-disabled");
      return NextResponse.redirect(url);
    }

    if (isPublicPath) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }

    const isAdminOnly = ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
    if (isAdminOnly && !isAdminTier(profile.role as Role)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (profile.role === "employee") {
      // Matches what page-level checks already allow employees to see (e.g.
      // /work only requires *a* profile, no role check — employees can
      // already read project/task data, they just can't create/bill, and the
      // Clients tab there hides itself for non-billing roles). This
      // previously only allowed "/" and "/account", which put employees in a
      // redirect loop the moment the dashboard sent them to a page they
      // couldn't reach.
      const allowed =
        pathname === "/" ||
        pathname.startsWith("/account") ||
        pathname.startsWith("/work") ||
        pathname.startsWith("/time-performance");
      if (!allowed) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}
