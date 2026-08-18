/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /* The public display runs unattended on a classroom TV; a stale-cache render
   * there would show the wrong night. Everything is rendered per request. */
  experimental: {}
};

export default nextConfig;
