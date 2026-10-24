/** @type {import('next').NextConfig} */
const { i18n } = require('./next-i18next.config');
const path = require('path');
const nextConfig = {
  i18n,
  output: 'standalone',
  reactStrictMode: false,
  compress: true,
  webpack: (config, { isServer }) => {
    config.module.rules = config.module.rules.concat([
      {
        test: /\.svg$/i,
        issuer: /\.[jt]sx?$/,
        use: ['@svgr/webpack']
      }
    ]);
    config.plugins = [...config.plugins];
    if (!isServer) {
      config.resolve.fallback = {
        fs: false
      };
    }
    return config;
  },
  transpilePackages: [
    '@labring/sealos-driver-sdk',
    '@sealos/ui',
    '@labring/sealos-ui',
    '@labring/sealos-shared-sdk',
    '@labring/sealos-gtm-sdk',
    '@labring/sealos-desktop-sdk',
    'geist'
  ],
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../'),
    instrumentationHook: true
  },
  async rewrites() {
    return [
      {
        source: '/api/v2alpha/openapi.json',
        destination: '/api/v2alpha/openapi'
      }
    ];
  }
};

module.exports = nextConfig;
