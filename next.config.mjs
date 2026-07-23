/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output makes the production Docker image small (Phase 6).
  output: 'standalone',
};

export default nextConfig;
