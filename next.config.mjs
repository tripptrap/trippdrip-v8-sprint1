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
      {
        // /messages was a real, shipped page until #89 deleted it as superseded
        // by /texts. Deleting a live URL without a redirect turns every existing
        // bookmark and link into a 404, which is a worse outcome than the dead
        // code it replaced.
        source: '/messages',
        destination: '/texts',
        permanent: false,
      },
      {
        // Same for the analytics page removed in #89 when the nav was
        // consolidated onto /analytics (#9).
        source: '/analytics-automation',
        destination: '/analytics',
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
