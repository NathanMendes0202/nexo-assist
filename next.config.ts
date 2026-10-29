import type { NextConfig } from 'next';

const config: NextConfig = {
  // Gera um servidor autônomo (.next/standalone): imagem Docker pequena.
  output: 'standalone',
  // Módulos nativos / de servidor: não devem ser empacotados pelo bundler.
  serverExternalPackages: ['better-sqlite3', '@mastra/core'],
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
