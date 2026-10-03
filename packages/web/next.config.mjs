/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const authServer = process.env.AUTH_SERVER_INTERNAL_URL ?? "http://localhost:3001";
    return [
      // Same-origin proxy so auth-server cookies (oauth_state, refresh_token)
      // are set on the web origin and sent back on later /token/* calls.
      // EXACT paths only — "/auth/callback" is a Next route, not a proxy
      // target, or the auth-server's redirect would loop back into itself.
      { source: "/auth/discord", destination: `${authServer}/auth/discord` },
      { source: "/auth/discord/callback", destination: `${authServer}/auth/discord/callback` },
      { source: "/token/:path*", destination: `${authServer}/token/:path*` },
    ];
  },
};

export default nextConfig;