import type { Intent } from '@uni-agent/shared';

export function buildExecutionAuthorizationMessage(
  intentId: string,
  planId: string,
  planHash: string,
  userAddress: string,
): string {
  return [
    'Uni-Agent execution authorization',
    `intentId: ${intentId}`,
    `planId: ${planId}`,
    `planHash: ${planHash}`,
    `userAddress: ${userAddress}`,
  ].join('\n');
}

export function assertExecutionAuthorized(
  intent: Intent,
  userAddress: string,
): void {
  if (intent.userAddress.toLowerCase() !== userAddress.toLowerCase()) {
    throw new Error('Intent owner mismatch');
  }

  if (intent.status !== 'planned') {
    throw new Error(`Intent not ready for execution: ${intent.status}`);
  }
}
