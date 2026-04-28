import type { Position } from '@uni-agent/shared';

export type MonitorSnapshot = {
  inRange: boolean;
  currentTick: number;
  tickLower: number;
  tickUpper: number;
  driftPercent: number;
};

export function deriveMonitorSnapshot(position?: Position | null): MonitorSnapshot {
  if (!position || !position.liquidity || position.liquidity === '0') {
    return {
      inRange: false,
      currentTick: 0,
      tickLower: 0,
      tickUpper: 0,
      driftPercent: 100,
    };
  }

  return {
    inRange: true,
    currentTick: 0,
    tickLower: -1000,
    tickUpper: 1000,
    driftPercent: 0,
  };
}
