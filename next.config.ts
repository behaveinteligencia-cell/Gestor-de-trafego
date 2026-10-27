import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 é módulo nativo: fica fora do bundle do servidor.
  serverExternalPackages: ["better-sqlite3"],
  experimental: {},
};

export default nextConfig;
