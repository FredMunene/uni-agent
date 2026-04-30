import type { Position } from '@uni-agent/shared';

export type MonitorSnapshot = {
  inRange: boolean;
  currentTick: number;
  tickLower: number;
  tickUpper: number;
  driftPercent: number;
};

type RangeAwarePosition = Position & {
  currentTick?: number;
  tickLower?: number;
  tickUpper?: number;
};

const DEFAULT_TICK_LOWER = -1000;
const DEFAULT_TICK_UPPER = 1000;

function deriveDriftPercent(currentTick: number, tickLower: number, tickUpper: number): number {
  if (currentTick >= tickLower && currentTick <= tickUpper) {
    return 0;
  }

  const rangeWidth = Math.max(1, tickUpper - tickLower);
  const driftTicks = currentTick < tickLower ? tickLower - currentTick : currentTick - tickUpper;
  return Math.min(100, Math.round((driftTicks / rangeWidth) * 100));
}

export function deriveMonitorSnapshot(position?: RangeAwarePosition | null): MonitorSnapshot {
  if (!position || !position.liquidity || position.liquidity === '0') {
    return {
      inRange: false,
      currentTick: 0,
      tickLower: 0,
      tickUpper: 0,
      driftPercent: 100,
    };
  }

  const currentTick = position.currentTick ?? 0;
  const tickLower = position.tickLower ?? DEFAULT_TICK_LOWER;
  const tickUpper = position.tickUpper ?? DEFAULT_TICK_UPPER;
  const inRange = currentTick >= tickLower && currentTick <= tickUpper;

  return {
    inRange,
    currentTick,
    tickLower,
    tickUpper,
    driftPercent: deriveDriftPercent(currentTick, tickLower, tickUpper),
  };
}
