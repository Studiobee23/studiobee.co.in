"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function AcceptInviteForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // The invite link's access/refresh tokens are picked up automatically from the URL
    // by the Supabase client (detectSessionInUrl), which fires this event once ready.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { display_name: displayName },
    });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      await supabase
        .from("profiles")
        .update({ display_name: displayName })
        .eq("id", userData.user.id);
    }

    router.push("/");
    router.refresh();
  }

  if (!ready) {
    return (
      <p className="mt-6 text-sm text-white/55">
        Verifying your invite link… if this doesn't load, the link may have expired —
        ask an admin to resend it.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="displayName" className="text-white/70">
          Your name
        </Label>
        <Input
          id="displayName"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="border-white/15 bg-white/5 text-white placeholder:text-white/30"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-white/70">
          Password
        </Label>
        <Input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border-white/15 bg-white/5 text-white placeholder:text-white/30"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm" className="text-white/70">
          Confirm password
        </Label>
        <Input
          id="confirm"
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="border-white/15 bg-white/5 text-white placeholder:text-white/30"
        />
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Setting up…" : "Set password & continue"}
      </Button>
    </form>
  );
}
