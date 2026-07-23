/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output makes the production Docker image small (Phase 6).
  output: 'standalone',
  // These load data/font files at runtime — don't bundle them (avoids ENOENT).
  experimental: {
    serverComponentsExternalPackages: ['pdfkit', 'pdfjs-dist', 'exceljs'],
  },
};

export default nextConfig;
