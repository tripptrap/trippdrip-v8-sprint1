/** @type {import('next').NextConfig} */
const nextConfig = {
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
