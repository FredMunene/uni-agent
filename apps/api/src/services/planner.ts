import type { Intent, Plan } from '@uni-agent/shared';
import { generatePlan } from '../agent/index.js';

export async function generatePlansForIntent(intent: Intent): Promise<Plan[]> {
  return generatePlan(intent);
}
