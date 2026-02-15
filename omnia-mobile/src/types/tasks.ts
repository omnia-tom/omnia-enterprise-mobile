export type TaskCategory = 'kitchen' | 'warehouse' | 'household' | 'office' | 'workshop' | 'outdoor' | 'personal_care';
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
}
