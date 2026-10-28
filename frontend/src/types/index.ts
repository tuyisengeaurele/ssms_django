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
  /** False once an administrator has turned the account off. */
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One farm in the supervisor's ranking, with the counts behind its level. See farms/risk.py for the rule. */
export interface FarmRisk {
  id: string;
  name: string;
  ownerName: string;
  location: string;
  level: 'HIGH' | 'MEDIUM' | 'OK';
  score: number;
  diseaseAlerts: number;
  openAirAlerts: number;
  offlineDevices: number;
  activeBatches: number;
}

export interface Farm {
  id: string;
  name: string;
  /** The place as one line, smallest part first. Farms from before places keep their own text. */
  location: string;
  street?: string;
  /** The official place at each level. All null on a farm from before places could be chosen. */
  province?: { code: string; name: string } | null;
  district?: { code: string; name: string } | null;
  sector?: { code: string; name: string } | null;
  cell?: { code: string; name: string } | null;
  village?: { code: string; name: string } | null;
  ownerId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  owner?: Pick<User, 'id' | 'name' | 'email'>;
  counts?: { batches: number };
  batches?: Batch[];
}

export type QuantityUnit = 'BOXES' | 'WORMS';

/** A room (or rearing house) on a farm. Every batch in it shares its air. */
export interface Room {
  id: string;
  name: string;
  notes: string;
  batchCount: number;
  batches: { id: string; stage: BatchStage }[];
  /** The sensors in this room. Their readings are the room's readings. */
  devices: { id: string; name: string; status: DeviceStatus; lastSeen: string | null }[];
  /** The newest reading of any sensor in the room, or null when nothing has been measured yet. */
  latestReading: { temperature: number; humidity: number; timestamp: string } | null;
  createdAt: string;
}

/** One stretch of a batch's life in a room. The open one (no end) is where it is now. */
export interface RoomStay {
  roomId: string;
  roomName: string;
  startedAt: string;
  endedAt: string | null;
}

/** Worms that died on one day. */
export interface MortalityEntry {
  id: string;
  count: number;
  note: string;
  /** The day, as 2026-05-20. */
  recordedOn: string;
  createdAt: string;
}

export interface Batch {
  id: string;
  farmId: string;
  stage: BatchStage;
  startDate: string;
  expectedHarvestDate: string;
  notes?: string;
  /** What kind of silkworm, as the farmer calls it. Empty when not given. */
  breed?: string;
  /** What the batch started with, counted in `quantityUnit`. */
  quantity?: number | null;
  quantityUnit?: QuantityUnit;
  /** The room it is in now, or null when it was never placed. */
  room?: { id: string; name: string } | null;
  /** Where it has been, newest first. */
  roomStays?: RoomStay[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  farm?: Pick<Farm, 'id' | 'name' | 'location'>;
  counts?: { diseaseDetections: number; sensorReadings: number; alertLogs: number };
  /** Only in the answer to creating a batch: set when it is the first the farmer has ever started. */
  milestone?: 'FIRST_BATCH' | null;
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
  /** What the farmer said about the result: right, wrong or not answered yet. */
  isCorrect?: boolean | null;
  /** When the result was wrong, what it really was, if they said. */
  actualResult?: string | null;
  feedbackAt?: string | null;
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
  /** Set for alerts about one batch. A problem in a room belongs to the room and has none. */
  batchId: string | null;
  roomId?: string | null;
  type: AlertType;
  message: string;
  isRead: boolean;
  createdAt: string;
  // enriched fields (optional, returned by some endpoints)
  farmName?: string;
  farmerName?: string;
  batch?: { id: string; stage: string } | null;
  room?: { id: string; name: string } | null;
  /** For a room alert: the batches in the room now. */
  batches?: { id: string; stage: string }[];
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
  /** Only in the answer to logging a harvest: set when it is the first the farmer has ever recorded. */
  milestone?: 'FIRST_HARVEST' | null;
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
  /** The farms with the most cocoons, top eight. */
  byFarm: Array<{ farm: string; count: number; totalKg: number }>;
}

/** What a paginated list answer says about itself. */
export interface PageMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export type DeviceStatus = 'online' | 'offline' | 'error';

export interface IoTDevice {
  id: string;
  name: string;
  deviceKey: string;
  farmId: string | null;
  farmName: string | null;
  batchId: string | null;
  /** The room the sensor measures, or null while it has not been placed. */
  room: { id: string; name: string } | null;
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
}
