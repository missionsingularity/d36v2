import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["exceljs", "pptxgenjs"],
};

export default nextConfig;
