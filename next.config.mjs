/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // ID card uploads go through a Server Action (two photos, up to 4 MB each).
    serverActions: { bodySizeLimit: "10mb" },
    proxyClientMaxBodySize: "10mb",
  },
};

export default nextConfig;
