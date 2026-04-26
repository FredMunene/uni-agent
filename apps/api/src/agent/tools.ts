import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';

export const tools: FunctionDeclaration[] = [
  {
    name: 'get_swap_quote',
    description:
      'Get a swap quote from the Uniswap Trading API. Returns expected output amount, gas estimate, price impact, and Permit2 calldata.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        chainId: { type: SchemaType.NUMBER, description: 'EVM chain ID (e.g. 84532 for Base Sepolia)' },
        tokenIn: { type: SchemaType.STRING, description: 'Input token contract address' },
        tokenOut: { type: SchemaType.STRING, description: 'Output token contract address' },
        amountIn: { type: SchemaType.STRING, description: 'Input amount in token base units (wei/smallest unit)' },
        recipient: { type: SchemaType.STRING, description: 'Address that will receive the output tokens' },
      },
      required: ['chainId', 'tokenIn', 'tokenOut', 'amountIn'],
    },
  },
  {
    name: 'get_lp_params',
    description:
      'Calculate Uniswap v4 LP position parameters from desired token amounts and pool info. Returns tick range, liquidity amount, and min amounts.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        chainId: { type: SchemaType.NUMBER },
        token0: { type: SchemaType.STRING, description: 'Token0 contract address (lower address)' },
        token1: { type: SchemaType.STRING, description: 'Token1 contract address (higher address)' },
        fee: { type: SchemaType.NUMBER, description: 'Pool fee tier in bps (100, 500, 3000, 10000)' },
        amount0Desired: { type: SchemaType.STRING, description: 'Desired amount of token0 in base units' },
        amount1Desired: { type: SchemaType.STRING, description: 'Desired amount of token1 in base units' },
        fullRange: {
          type: SchemaType.BOOLEAN,
          description: 'Use full tick range (-887272 to 887272). Recommended for hackathon.',
        },
      },
      required: ['chainId', 'token0', 'token1', 'fee', 'amount0Desired', 'amount1Desired'],
    },
  },
  {
    name: 'simulate_bundle',
    description:
      'Simulate the full 2-step execution bundle (swap + add_liquidity) via eth_call without broadcasting. Returns expected outputs and gas.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        chainId: { type: SchemaType.NUMBER },
        userAddress: { type: SchemaType.STRING },
        swapQuoteId: { type: SchemaType.STRING, description: 'Quote ID from get_swap_quote' },
        lpParams: { type: SchemaType.OBJECT, description: 'LP params from get_lp_params',
          properties: {}, },
      },
      required: ['chainId', 'userAddress', 'swapQuoteId', 'lpParams'],
    },
  },
];

// OpenAPI-style schema for the GET /agent/tool-schema endpoint
export const toolSchemaForApi = tools.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
}));
