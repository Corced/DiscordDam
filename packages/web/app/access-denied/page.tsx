import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Access Denied",
  description: "DiscordGate access denied.",
};

const SERVER_NAME = process.env.NEXT_PUBLIC_SERVER_NAME ?? "our community";
const INVITE_LINK = process.env.NEXT_PUBLIC_DISCORD_INVITE_LINK ?? "#";

const MESSAGES: Record<string, string> = {
  not_member: `You must be a member of ${SERVER_NAME} to access this platform.`,
  invalid_state: "Your login session expired or was invalid. Please try again.",
  server_error: "Something went wrong on our end. Please try again later.",
  revoked: "Your access has been revoked by an administrator.",
};

export default function AccessDeniedPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  const message = MESSAGES[searchParams.reason ?? ""] ?? MESSAGES.server_error!;
  const isNotMember = searchParams.reason === "not_member";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in rounded-xl bg-[#2B2D31] p-8 text-center shadow-lg">
        <div className="text-6xl" aria-hidden="true">
          ⚠️
        </div>
        <h1 className="mt-4 text-xl font-semibold text-red-400">Access Denied</h1>
        <p className="mt-3 text-gray-300">{message}</p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {isNotMember && (
            <a
              href={INVITE_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-[#5865F2] px-5 py-2.5 font-semibold text-white transition-colors hover:bg-[#4752C4]"
            >
              Join {SERVER_NAME} on Discord
            </a>
          )}
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg border border-white/15 px-5 py-2.5 font-semibold text-gray-200 transition-colors hover:bg-white/5"
          >
            {isNotMember ? "Try Login Again" : "Try Again"}
          </Link>
        </div>
      </div>
    </main>
  );
}