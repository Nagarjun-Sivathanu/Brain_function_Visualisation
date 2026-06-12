/** @type {import('next').NextConfig} */
// In Docker, BACKEND_URL points to the backend service name (e.g. http://backend:8000).
// In local dev (no Docker), it defaults to localhost.
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
