/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // pdf-parse must not be bundled by webpack.
    //
    // It ships `dist/worker/` and `dist/node/` and resolves those paths at
    // runtime. Bundled, the require targets no longer exist and parsing fails
    // inside the serverless function — while working perfectly under plain
    // `node`, which is exactly how the v2 API fix (4627780) passed locally and
    // still returned "Could not read that PDF file" in production.
    //
    // Anything that loads files relative to its own package at runtime belongs
    // here; the symptom is always "works locally, fails deployed".
    serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist'],

    // pdfjs loads its worker as a sibling file at runtime:
    //
    //   Cannot find module '/var/task/node_modules/pdfjs-dist/legacy/build/
    //   pdf.worker.mjs' imported from .../pdf.mjs
    //
    // Vercel's file tracing only ships what it can see statically, and a
    // dynamic import by path is invisible to it. This names the files so they
    // are deployed alongside the function.
    outputFileTracingIncludes: {
      '/api/leads/upload-document': ['./node_modules/pdfjs-dist/legacy/build/**'],
    },
  },

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
