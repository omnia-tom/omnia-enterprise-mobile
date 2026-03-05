export type TaskCategory =
  | 'kitchen'
  | 'warehouse'
  | 'household'
  | 'office'
  | 'workshop'
  | 'outdoor'
  | 'personal_care'
  // Dakkota assembly domains (from workers_instructions)
  | 'front_bumper_grille'
  | 'front_fascia'
  | 'rear_bumper'
  | 'front_suspension'
  | 'rear_suspension'
  | 'overhead_systems'
  | 'tire_wheel';
export type TaskDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface Task {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  difficulty: TaskDifficulty;
  payoutCents: number;
  estimatedMinutes: number;
  requirements: string[];
  instructions: string[];
  maxSubmissions: number;
  currentSubmissions: number;
  requiredDuration: { minSeconds: number; maxSeconds: number };
  handTrackingRequired: boolean;
}

export type SubmissionStatus = 'recording' | 'uploading' | 'under_review' | 'approved' | 'rejected';

export interface StepRecap {
  stepIndex: number;
  instruction: string;
  stillImageUri?: string;
  handPoseSample?: { timestamp: number; hands: Array<{ chirality: string; joints: Array<{ name: string; x: number; y: number }> }> };
}

export interface Submission {
  id: string;
  taskId: string;
  taskTitle: string;
  userId: string;
  status: SubmissionStatus;
  videoFilePath: string;
  duration: number;
  frameCount: number;
  payoutCents?: number;
  submittedAt: Date;
  reviewedAt?: Date;
  rejectionReason?: string;
  stepRecaps?: StepRecap[];
  handPoseSamples?: Array<{ timestamp: number; elapsedSec: number; hands: unknown[] }>;
}
