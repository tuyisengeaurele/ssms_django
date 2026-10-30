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

/** The cooperative report for a range of dates. See reports/coop.py. */
export interface CoopReport {
  generatedAt: string;
  /** Null when the report covers every cooperative. */
  cooperative: { id: string; name: string } | null;
  period: { from: string; to: string };
  totals: { farms: number; farmers: number; batchesRunning: number; batchesStarted: number };
  harvest: { records: number; totalKg: number; silkG: number; byGrade: { grade: string; count: number; totalKg: number }[] };
  checks: { total: number; found: number; byResult: { result: string; count: number }[] };
  alerts: { total: number; acknowledged: number; resolved: number; byType: { type: string; count: number }[] };
  /** Ranked by risk today. The level is not for the period. */
  farms: {
    id: string; name: string; ownerName: string; location: string; level: 'HIGH' | 'MEDIUM' | 'OK'; score: number;
    diseaseAlerts: number; openAirAlerts: number; offlineDevices: number; activeBatches: number; harvestKg: number; alerts: number;
  }[];
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
  /** Where the farm goes on the map. exact: the spot its owner saved. village or sector: the middle of that place. Null: none. */
  position: { lat: number; lng: number; precision: 'exact' | 'village' | 'sector' } | null;
}

export interface Farm {
  id: string;
  name: string;
  /** The place as one line, smallest part first. Farms from before places keep their own text. */
  location: string;
  street?: string;
  /** The exact spot the farm stands on, when its owner saved it. Supervisors and admins see it on the map. */
  latitude?: number | null;
  longitude?: number | null;
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
  /** The supervisor or admin who said they are dealing with it. Not the same as read. */
  acknowledgedBy?: { id: string; name: string } | null;
  acknowledgedAt?: string | null;
  commentCount?: number;
}

/** One thing said about an alert. No role is given, so a farmer is not told what kind of account wrote it. */
export interface AlertComment {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string } | null;
  canDelete: boolean;
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
  /** The admin who sent an answer, and when. Marked by hand, because the reply goes out from their own mail app. */
  repliedAt?: string | null;
  repliedBy?: { id: string; name: string } | null;
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

/** One batch of the side by side comparison, from GET /api/batches/compare. */
export interface BatchComparison {
  id: string;
  code: string;
  farm: { id: string; name: string };
  breed: string;
  stage: BatchStage;
  room: string | null;
  startDate: string;
  expectedHarvestDate: string;
  daysRunning: number;
  quantity: number | null;
  quantityUnit: QuantityUnit;
  deaths: number;
  /** Only when the batch was counted in worms. */
  deathRatePct: number | null;
  harvest: {
    records: number;
    cocoonKg: number;
    silkG: number;
    grades: Record<'A' | 'B' | 'C', number>;
    /** Kilograms per egg box, or per thousand worms. Null without a harvest or a start count. */
    yieldPerUnit: { unit: QuantityUnit; kg: number } | null;
    /** The harvest so far, one point per record, by the day since the batch started. */
    curve: Array<{ day: number; kg: number }>;
  };
  /** Null when the batch has no readings. */
  conditions: { inRangePct: number; readings: number } | null;
  checks: { total: number; grasserie: number };
  alerts: number;
}
