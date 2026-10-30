const isDev = process.env.NODE_ENV !== 'production';

// Report-Only for now: violations show in the browser console without breaking wallets.
// Switch the header name to Content-Security-Policy once a few sessions run clean.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  [
    "connect-src 'self'",
    'https://sepolia.base.org https://mainnet.base.org',
    'https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.com wss://*.walletconnect.org',
    'https://*.reown.com wss://*.reown.com https://*.web3modal.org',
    'https://*.coinbase.com wss://*.coinbase.com',
  ].join(' '),
  'frame-src https://verify.walletconnect.com https://verify.walletconnect.org',
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // MetaMask SDK / WalletConnect optionally import React Native and Node-only modules.
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, '@react-native-async-storage/async-storage': false };
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
  // Legacy routes from the original spec.
  async redirects() {
    return [
      { source: '/dashboard', destination: '/vault', permanent: true },
      { source: '/setup', destination: '/vault/create', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' }, // wallet dApps are clickjacking targets
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy-Report-Only', value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
