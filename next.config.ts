import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Build sırasında ESLint hatalarını ignore et (production deploy için)
    ignoreDuringBuilds: true,
  },
  typescript: {
    // TypeScript hatalarını build sırasında kontrol et ama build'i durdurma
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
