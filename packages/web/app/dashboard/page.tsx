"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAccessToken, getAccessToken } from "@/lib/accessToken";

/** Placeholder dashboard so the login flow has a landing target. Replace with the real one. */
export default function DashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (getAccessToken() === null) {
      // Full reload cleared the in-memory token — back to login (a future
      // dashboard mints a fresh one via POST /token/refresh instead).
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="animate-pulse text-gray-400">Loading...</p>
      </main>
    );
  }

  const signOut = async (): Promise<void> => {
    await fetch("/token/revoke", { method: "POST" }).catch(() => undefined);
    clearAccessToken();
    router.replace("/login");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in rounded-xl bg-[#2B2D31] p-8 text-center shadow-lg">
        <h1 className="text-2xl font-bold text-white">You&apos;re in ✅</h1>
        <p className="mt-2 text-sm text-gray-400">
          Membership verified. (Placeholder dashboard — replace with the real one.)
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-6 inline-flex items-center justify-center rounded-lg border border-white/15 px-5 py-2.5 font-semibold text-gray-200 transition-colors hover:bg-white/5"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}