/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Optimize for production
  swcMinify: true,
  
  // Add security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          }
        ]
      }
    ];
  },

  // Webpack config for external packages
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        'firebase-admin': 'commonjs firebase-admin',
        '@google/generative-ai': 'commonjs @google/generative-ai',
        'groq-sdk': 'commonjs groq-sdk',
        'together-ai': 'commonjs together-ai'
      });
    }
    return config;
  },

  // Environment variables exposed to browser (only public ones)
  env: {
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID
  }
};

export default nextConfig;
