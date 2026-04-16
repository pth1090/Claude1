/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize better-sqlite3 from webpack bundling (native module)
      const externals = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [...externals, "better-sqlite3"];
    }
    return config;
  },
};

export default nextConfig;
