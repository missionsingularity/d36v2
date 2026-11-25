import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  serverExternalPackages: ["exceljs", "pptxgenjs"],
};

export default nextConfig;
