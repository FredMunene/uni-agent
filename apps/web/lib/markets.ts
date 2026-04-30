import { BASE_MAINNET, BASE_SEPOLIA, EXECUTION_CHAIN_ID, LP_FEE_TIERS, QUOTE_CHAIN_ID } from '@uni-agent/shared';

export type MarketConfig = {
  id: string;
  label: string;
  chainLabel: string;
  quoteChainId: number;
  executionChainId: number;
  inputTokenSymbol: string;
  outputTokenSymbol: string;
  quoteTokenIn: string;
  quoteTokenOut: string;
  executionTokenIn: string;
  executionTokenOut: string;
  fee: number;
  stableReferenceSymbols: readonly string[];
  lpSymbols: readonly string[];
};

export const ACTIVE_MARKET: MarketConfig = {
  id: 'base-usdc-weth-005',
  label: 'USDC/WETH 0.05%',
  chainLabel: 'Base',
  quoteChainId: QUOTE_CHAIN_ID,
  executionChainId: EXECUTION_CHAIN_ID,
  inputTokenSymbol: 'USDC',
  outputTokenSymbol: 'WETH',
  quoteTokenIn: BASE_MAINNET.USDC,
  quoteTokenOut: BASE_MAINNET.WETH,
  executionTokenIn: BASE_SEPOLIA.USDC,
  executionTokenOut: BASE_SEPOLIA.WETH,
  fee: LP_FEE_TIERS.LOW,
  stableReferenceSymbols: ['usdc', 'usdt'],
  lpSymbols: ['usdc', 'weth'],
};
