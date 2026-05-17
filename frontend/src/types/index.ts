export type Role = 'ADMIN' | 'SUPERVISOR' | 'FARMER';

export type BatchStage = 'EGG' | 'LARVA' | 'PUPA' | 'COCOON' | 'HARVEST';

export type AlertType = 'TEMPERATURE' | 'HUMIDITY' | 'DISEASE' | 'STAGE_CHANGE' | 'SYSTEM';

export interface Cooperative {
  id: string;
  name: string;
  description?: string;
  location?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  farmCount: number;
}

export interface CooperativeDetail extends Cooperative {
  members: Array<{ id: string; name: string; email: string; role: Role; createdAt: string }>;
  farms: Array<{ id: string; name: string; location: string; ownerId: string; ownerName: string }>;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  cooperativeId?: string | null;
  cooperativeName?: string | null;
  isEmailVerified: boolean;
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
  // enriched fields (optional, returned by some endpoints)
  farmName?: string;
  farmerName?: string;
  batch?: { id: string; stage: string };
}

export type QualityGrade = 'A' | 'B' | 'C';

export interface HarvestRecord {
  id: string;
  batchId: string;
  cocoonWeightKg: number;
  silkYieldG?: number | null;
  qualityGrade: QualityGrade;
  notes?: string | null;
  harvestedAt: string;
  createdAt: string;
  // enriched fields (returned by /harvest global list)
  farmName?: string | null;
  farmId?: string | null;
}

export interface HarvestStats {
  totalWeightKg: number;
  totalSilkG: number;
  avgWeightKg: number;
  recordCount: number;
  byGrade: Array<{ grade: QualityGrade; count: number; totalKg: number }>;
}

export type DeviceStatus = 'online' | 'offline' | 'error';

export interface IoTDevice {
  id: string;
  name: string;
  deviceKey: string;
  farmId: string | null;
  farmName: string | null;
  batchId: string | null;
  location: string;
  status: DeviceStatus;
  lastSeen: string | null;
  isActive: boolean;
  createdAt: string;
  latestReading: {
    temperature: number;
    humidity: number;
    timestamp: string;
  } | null;
  recentReadings?: Array<{
    temperature: number;
    humidity: number;
    timestamp: string;
  }>;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
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
  refreshToken: string;
}
