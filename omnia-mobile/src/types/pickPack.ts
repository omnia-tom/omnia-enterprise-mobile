/**
 * Pick-Pack Type Definitions
 * Types for warehouse pick-pack operations
 */

export interface PickOrder {
  id: string;
  userId: string;
  userName: string;
  organizationId: string;
  items: PickItem[];
  currentStep: number;
  status: 'pending' | 'in_progress' | 'completed';
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface PickItem {
  productId: string;
  upc: string;
  productName: string;
  quantity: number;
  location: PickLocation;
  scanned: boolean;
  scannedAt?: Date;
}

export interface PickLocation {
  aisle: string;
  shelf: string;
  bin: string;
}

export interface ScanResponse {
  success: boolean;
  message: string;
  recall?: RecallAlert;
  nextItem?: PickItem;
  currentStep?: number;
  totalSteps?: number;
  completed?: boolean;
  error?: string;
}

export interface RecallAlert {
  id: string;
  upc: string;
  productName: string;
  reason: string;
  recallDate: Date;
  instructions: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * API Request/Response types
 */

export interface GetPickOrderResponse {
  pickOrder: PickOrder | null;
}

export interface SubmitScanRequest {
  upc: string;
}

export interface CompletePickOrderResponse {
  success: boolean;
  message: string;
}
