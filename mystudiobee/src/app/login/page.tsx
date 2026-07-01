import Image from "next/image";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="bg-gradient-blue flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-elevated backdrop-blur-sm">
        <Image src="/studiobee-white.png" alt="StudioBee" width={140} height={36} className="mb-4" />
        <p className="mt-1 text-sm text-white/55">Sign in with your StudioBee account.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
