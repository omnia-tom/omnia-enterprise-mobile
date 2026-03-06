import type { TaskCategory } from '../types';

/**
 * Car spot positions (percentage of container) for no_dots_car.png filtering UI.
 * Container aspect ratio: 656 / 437.33334 (per Figma/Swift).
 * Car is side profile, facing right (front = high left %, rear = low left %).
 * Positions refined from workers_instructions 1-8.png so dots stay inside outline.
 */
export const CAR_SPOTS: { category: TaskCategory; left: string; top: string }[] = [
  { category: 'front_bumper_grille', left: '85%', top: '53%' },
  { category: 'front_fascia', left: '81%', top: '45%' },
  { category: 'front_suspension', left: '77%', top: '65%' },
  { category: 'overhead_systems', left: '50%', top: '28%' },
  { category: 'rear_suspension', left: '31%', top: '65%' },
  { category: 'tire_wheel', left: '37%', top: '63%' },
  { category: 'rear_bumper', left: '23%', top: '53%' },
  { category: 'rear_fascia', left: '29%', top: '41%' },
];
