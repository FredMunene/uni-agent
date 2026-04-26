'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { RainbowKitProvider, getDefaultConfig, darkTheme } from '@rainbow-me/rainbowkit';
import { metaMaskWallet, coinbaseWallet } from '@rainbow-me/rainbowkit/wallets';
import '@rainbow-me/rainbowkit/styles.css';

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? 'demo';

const config = getDefaultConfig({
  appName: 'Intent Router',
  projectId,
  chains: [baseSepolia],
  wallets: [
    {
      groupName: 'Wallets',
      wallets: [metaMaskWallet, coinbaseWallet],
    },
  ],
  transports: { [baseSepolia.id]: http() },
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#f97316',
            accentColorForeground: '#0a0a0a',
            borderRadius: 'none',
            fontStack: 'system',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
