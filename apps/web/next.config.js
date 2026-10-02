const API = process.env.API_URL || 'http://localhost:4000';

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // The browser talks to /api on the same origin, so there are no CORS problems
  // and canvas can read dish images for the 3D relief.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
};
