import { z } from 'zod';

export const CreateIntentSchema = z.object({
  userAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid address'),
  inputToken: z.string().min(1),
  inputAmount: z.string().regex(/^\d+$/, 'Must be integer string (wei/units)'),
  goal: z.string().min(1),
  risk: z.enum(['low', 'medium', 'high']).default('low'),
  constraints: z.object({
    maxSlippageBps: z.number().int().min(1).max(500).default(50),
    deadlineSeconds: z.number().int().min(60).max(3600).default(900),
    allowBridge: z.boolean().default(false),
    allowBorrow: z.boolean().default(false),
  }).default({}),
});

export const GetQuoteSchema = z.object({
  type: z.literal('swap'),
  chainId: z.number().int(),
  tokenIn: z.string(),
  tokenOut: z.string(),
  amountIn: z.string(),
  recipient: z.string().optional(),
});

export const ExecuteSchema = z.object({
  permit2Signature: z.string(),
  userAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

export type CreateIntentInput = z.infer<typeof CreateIntentSchema>;
export type GetQuoteInput = z.infer<typeof GetQuoteSchema>;
export type ExecuteInput = z.infer<typeof ExecuteSchema>;
