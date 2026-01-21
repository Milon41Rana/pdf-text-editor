/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, {
    isServer
  }) => {
    if (!isServer) {
      config.externals.push({
        "pdfjs-dist": `Promise.resolve(window.pdfjsLib)`
      });
    }
    return config;
  },
};

module.exports = nextConfig;
