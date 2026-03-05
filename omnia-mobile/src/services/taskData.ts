import { Task, Submission, TaskCategory, SubmissionStatus } from '../types/tasks';

// Dakkota assembly tasks — aligned with workers_instructions / INTEGRATED systems
const MOCK_TASKS: Task[] = [
  {
    id: 'task-fbg',
    title: 'Front Bumper & Grille',
    description: 'Multi-part integration, alignment-critical, visible quality surface.',
    category: 'front_bumper_grille',
    difficulty: 'intermediate',
    payoutCents: 200,
    estimatedMinutes: 15,
    requirements: ['Both hands visible', 'Assembly station', 'Front bumper and grille components'],
    instructions: [
      'Position the bumper assembly on the workstation',
      'Align grille with bumper mounts',
      'Secure fasteners in sequence per SOP',
      'Verify alignment and fit tolerance',
      'Confirm clip engagement at each point',
    ],
    maxSubmissions: 50,
    currentSubmissions: 0,
    requiredDuration: { minSeconds: 180, maxSeconds: 900 },
    handTrackingRequired: true,
  },
  {
    id: 'task-ff',
    title: 'Front Fascia',
    description: 'Paint-matched trim, clip/fastener sequence, fit tolerance sensitive.',
    category: 'front_fascia',
    difficulty: 'intermediate',
    payoutCents: 175,
    estimatedMinutes: 12,
    requirements: ['Both hands visible', 'Assembly station', 'Front fascia components'],
    instructions: [
      'Inspect fascia for damage before assembly',
      'Follow clip and fastener sequence per SOP',
      'Apply even pressure for fit tolerance',
      'Verify paint match and alignment',
    ],
    maxSubmissions: 50,
    currentSubmissions: 0,
    requiredDuration: { minSeconds: 120, maxSeconds: 720 },
    handTrackingRequired: true,
  },
  {
    id: 'task-rb',
    title: 'Rear Bumper',
    description: 'Rear bumper assembly with alignment and fastener sequence.',
    category: 'rear_bumper',
    difficulty: 'intermediate',
    payoutCents: 175,
    estimatedMinutes: 12,
    requirements: ['Both hands visible', 'Assembly station', 'Rear bumper components'],
    instructions: [
      'Position rear bumper on fixtures',
      'Align with mounting points',
      'Secure fasteners in specified sequence',
      'Verify fit and finish',
    ],
    maxSubmissions: 50,
    currentSubmissions: 0,
    requiredDuration: { minSeconds: 120, maxSeconds: 720 },
    handTrackingRequired: true,
  },
  {
    id: 'task-fs',
    title: 'Front Suspension',
    description: 'Safety-critical, torque-sequence dependent, multi-tool workflow.',
    category: 'front_suspension',
    difficulty: 'advanced',
    payoutCents: 300,
    estimatedMinutes: 25,
    requirements: ['Both hands visible', 'Assembly station', 'Torque tools', 'Front suspension module'],
    instructions: [
      'Position suspension module per SOP',
      'Apply torque in specified sequence',
      'Use correct tool for each fastener',
      'Verify torque values at checkpoints',
      'Confirm safety-critical connections',
    ],
    maxSubmissions: 40,
    currentSubmissions: 0,
    requiredDuration: { minSeconds: 300, maxSeconds: 1500 },
    handTrackingRequired: true,
  },
  {
    id: 'task-rs',
    title: 'Rear Suspension',
    description: 'Safety-critical, multi-axis positioning, alignment verification.',
    category: 'rear_suspension',
    difficulty: 'advanced',
    payoutCents: 300,
    estimatedMinutes: 25,
    requirements: ['Both hands visible', 'Assembly station', 'Rear suspension module'],
    instructions: [
      'Position rear suspension module',
      'Multi-axis alignment per SOP',
      'Secure safety-critical fasteners',
      'Verify alignment specifications',
    ],
    maxSubmissions: 40,
    currentSubmissions: 0,
    requiredDuration: { minSeconds: 300, maxSeconds: 1500 },
    handTrackingRequired: true,
  },
  {
    id: 'task-oh',
    title: 'Overhead Systems',
    description: 'Confined-space assembly, wiring integration, sequence-dependent.',
    category: 'overhead_systems',
    difficulty: 'advanced',
    payoutCents: 250,
    estimatedMinutes: 20,
    requirements: ['Both hands visible', 'Assembly station', 'Overhead system components'],
    instructions: [
      'Position overhead components',
      'Route wiring per sequence',
      'Secure in confined space',
      'Verify wiring connections',
    ],
    maxSubmissions: 45,
    currentSubmissions: 0,
    requiredDuration: { minSeconds: 240, maxSeconds: 1200 },
    handTrackingRequired: true,
  },
  {
    id: 'task-rf',
    title: 'Rear Fascia',
    description: 'Rear fascia assembly with taillight integration and fit tolerance.',
    category: 'rear_fascia',
    difficulty: 'intermediate',
    payoutCents: 175,
    estimatedMinutes: 12,
    requirements: ['Both hands visible', 'Assembly station', 'Rear fascia components'],
    instructions: [
      'Inspect rear fascia for damage',
      'Align taillight assemblies',
      'Secure fasteners per SOP',
      'Verify fit and light operation',
    ],
    maxSubmissions: 50,
    currentSubmissions: 0,
    requiredDuration: { minSeconds: 120, maxSeconds: 720 },
    handTrackingRequired: true,
  },
  {
    id: 'task-tw',
    title: 'Tire & Wheel Assembly',
    description: 'Torque-critical, balance-sensitive, safety-rated fastening.',
    category: 'tire_wheel',
    difficulty: 'intermediate',
    payoutCents: 200,
    estimatedMinutes: 18,
    requirements: ['Both hands visible', 'Assembly station', 'Torque wrench', 'Tire and wheel'],
    instructions: [
      'Mount tire to wheel per SOP',
      'Apply torque in star pattern',
      'Verify torque values',
      'Check balance before final installation',
    ],
    maxSubmissions: 50,
    currentSubmissions: 0,
    requiredDuration: { minSeconds: 180, maxSeconds: 1080 },
    handTrackingRequired: true,
  },
];

// In-memory submissions store (session only)
let submissions: Submission[] = [];

export async function getAvailableTasks(): Promise<Task[]> {
  return [...MOCK_TASKS];
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  return MOCK_TASKS.find(t => t.id === id);
}

export async function getTasksByCategory(category: TaskCategory): Promise<Task[]> {
  return MOCK_TASKS.filter(t => t.category === category);
}

export async function getUserSubmissions(userId: string): Promise<Submission[]> {
  return submissions.filter(s => s.userId === userId);
}

export async function getSubmissionById(id: string): Promise<Submission | undefined> {
  return submissions.find(s => s.id === id);
}

export async function addSubmission(submission: Submission): Promise<void> {
  submissions.push(submission);
  const task = MOCK_TASKS.find(t => t.id === submission.taskId);
  if (task) {
    task.currentSubmissions += 1;
  }
}

export function getTotalEarnings(userSubmissions: Submission[]): number {
  return userSubmissions
    .filter(s => s.status === 'approved')
    .reduce((sum, s) => sum + s.payoutCents, 0);
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
