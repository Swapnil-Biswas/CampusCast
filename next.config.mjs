/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // ID card uploads go through a Server Action (one photo, up to 4 MB).
    serverActions: { bodySizeLimit: "10mb" },
    proxyClientMaxBodySize: "10mb",
  },
};

export default nextConfig;
