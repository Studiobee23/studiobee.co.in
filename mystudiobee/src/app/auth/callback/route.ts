import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase's browser client uses the PKCE flow by default, so invite/magic-link/OAuth
// redirects land here with a `?code=` param that must be exchanged for a session
// server-side before the destination page can see the user as signed in.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/accept-invite";
  // `next` is attacker-controllable (it's a query param on a link we email out) — only
  // allow same-app relative paths so this can't be turned into an open redirect.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
    ? rawNext
    : "/accept-invite";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invite-link-invalid`);
}
