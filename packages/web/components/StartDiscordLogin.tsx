"use client";

import { useState } from "react";
import { DiscordButton } from "./DiscordButton";

/**
 * Client wrapper that owns the navigation to the auth-server's
 * /auth/discord (proxied same-origin). Exists because the login page is a
 * server component and React forbids passing function props (onClick)
 * across the server→client boundary.
 */
export function StartDiscordLogin() {
  const [redirecting, setRedirecting] = useState(false);

  return (
    <DiscordButton
      loading={redirecting}
      onClick={() => {
        setRedirecting(true);
        window.location.assign("/auth/discord");
      }}
    />
  );
}