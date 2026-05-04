export type Role = 'ADMIN' | 'SUPERVISOR' | 'FARMER';

export type BatchStage = 'EGG' | 'LARVA' | 'PUPA' | 'COCOON' | 'HARVEST';

export type AlertType = 'TEMPERATURE' | 'HUMIDITY' | 'DISEASE' | 'STAGE_CHANGE' | 'SYSTEM';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface Farm {
  id: string;
  name: string;
  location: string;
  ownerId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  owner?: Pick<User, 'id' | 'name' | 'email'>;
  counts?: { batches: number };
  batches?: Batch[];
}

export interface Batch {
  id: string;
  farmId: string;
  stage: BatchStage;
  startDate: string;
  expectedHarvestDate: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  farm?: Pick<Farm, 'id' | 'name' | 'location'>;
  counts?: { diseaseDetections: number; sensorReadings: number; alertLogs: number };
  diseaseDetections?: DiseaseDetection[];
  sensorReadings?: SensorReading[];
  alertLogs?: AlertLog[];
}

export interface DiseaseDetection {
  id: string;
  batchId: string;
  imageUrl: string;
  result: string;
  confidence: number;
  detectedAt: string;
  notes?: string;
}

export interface SensorReading {
  id: string;
  batchId: string;
  temperature: number;
  humidity: number;
  timestamp: string;
}

export interface AlertLog {
  id: string;
  batchId: string;
  type: AlertType;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface AuthResponse {
  user: User;
  token: string;
}
