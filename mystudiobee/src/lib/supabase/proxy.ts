import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminTier, type Role } from "@/lib/role";

const PUBLIC_PATHS = ["/login", "/accept-invite", "/auth/callback"];
const ADMIN_ONLY_PREFIXES = ["/admin"];

export async function updateSession(request: NextRequest) {
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
      // /projects only requires *a* profile, no role check — employees can
      // already read project data, they just can't create/bill). This
      // previously only allowed "/" and "/account", which put employees in a
      // redirect loop the moment the dashboard sent them to /tasks.
      const allowed =
        pathname === "/" ||
        pathname.startsWith("/account") ||
        pathname.startsWith("/tasks") ||
        pathname.startsWith("/clock") ||
        pathname.startsWith("/projects") ||
        pathname.startsWith("/performance");
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
