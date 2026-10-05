import type { Metadata } from "next";
import { StartDiscordLogin } from "@/components/StartDiscordLogin";

export const metadata: Metadata = {
  title: "Login",
  description: "Sign in with Discord to access DiscordDam.",
};

const SERVER_NAME = process.env.NEXT_PUBLIC_SERVER_NAME ?? "our community";
const INVITE_LINK = process.env.NEXT_PUBLIC_DISCORD_INVITE_LINK ?? "#";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in rounded-xl bg-[#2B2D31] p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-white">DiscordDam</h1>
        <p className="mt-1 font-medium text-[#5865F2]">{SERVER_NAME}</p>
        <p className="mt-2 text-sm text-gray-400">
          Access is restricted to {SERVER_NAME} Discord members.
        </p>

        <div className="my-6 border-t border-white/10" role="separator" />

        <div className="flex sm:justify-start">
          <StartDiscordLogin />
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Don&apos;t have an account?{" "}
          <a
            href={INVITE_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#5865F2] underline"
          >
            Join {SERVER_NAME} on Discord
          </a>
        </p>
      </div>
    </main>
  );
}
