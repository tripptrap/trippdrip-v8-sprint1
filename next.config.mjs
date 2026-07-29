/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        // /login is the URL people guess first, and it 404'd — the real sign-in
        // page is /auth/login, which is also what middleware redirects to.
        // A dead app/login/ directory (a pass-through layout with no page) used
        // to sit here and produced no route at all. See #75.
        source: '/login',
        destination: '/auth/login',
        permanent: false,
      },
      {
        source: '/signin',
        destination: '/auth/login',
        permanent: false,
      },
    ];
  },

  async rewrites() {
    return [
      {
        // Rewrite /opt-in-proof.png to serve the HTML opt-in proof page
        // This handles the URL submitted to toll-free verification
        source: '/opt-in-proof.png',
        destination: '/opt-in-proof.html',
      },
    ];
  },
};

export default nextConfig;
