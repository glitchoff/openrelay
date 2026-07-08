import type { NextConfig } from "next";

const allowedDevOrigins = [
  "localhost:3000",
  "127.0.0.1:3000",
  ...(process.env.ALLOWED_DEV_ORIGINS ? process.env.ALLOWED_DEV_ORIGINS.split(",") : [])
];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
