import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Vercel/Netlify will handle output automatically. */
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
};

export default nextConfig;
