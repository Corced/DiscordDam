"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { DiscordLogo } from "@/components/DiscordButton";
import { setAccessToken } from "@/lib/accessToken";

/**
 * OAuth callback receiver. The auth-server performed the code+PKCE exchange
 * and redirected here with the access token in the URL fragment (# — never
 * sent to servers, kept out of access logs). This page stores the token,
 * scrubs the fragment, and moves on to the dashboard.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const handled = useRef(false); // React StrictMode double-fires effects in dev

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const accessToken = new URLSearchParams(window.location.hash.slice(1)).get("access_token");
    if (accessToken === null) {
      router.replace("/access-denied?reason=server_error");
      return;
    }
    setAccessToken(accessToken);
    // Remove the token from the address bar and history.
    window.history.replaceState(null, "", window.location.pathname);
    router.replace("/dashboard");
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <div className="animate-pulse">
        <DiscordLogo className="h-16 w-16 text-[#5865F2]" />
      </div>
      <p className="animate-pulse text-gray-400">Verifying your Discord membership...</p>
    </main>
  );
}