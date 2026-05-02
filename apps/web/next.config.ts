import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@uni-agent/shared'],
  webpack(config) {
    // MetaMask SDK pulls in React Native storage; pino-pretty is optional in WalletConnect.
    // Neither is used in browser — alias them to empty modules to silence the warnings.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
    };
    return config;
  },
};

export default nextConfig;
