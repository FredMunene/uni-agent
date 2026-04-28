'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, http } from 'wagmi';
import { baseSepolia, base, mainnet } from 'wagmi/chains';
import { RainbowKitProvider, getDefaultConfig, lightTheme } from '@rainbow-me/rainbowkit';
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
  transports: {
    [baseSepolia.id]: http(),
    [base.id]: http(),       // Basename resolution
    [mainnet.id]: http(),    // ENS resolution
  },
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: '#f97316',
            accentColorForeground: '#ffffff',
            borderRadius: 'medium',
            fontStack: 'system',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
