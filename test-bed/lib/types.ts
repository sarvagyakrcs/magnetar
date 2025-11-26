export type Algorithm = "roundRobin" | "random" | "proprietry"

export type Mode = "All_Success" | "All_fail" | "percentage_fail"

export interface WorkerOverrideFields {
  PROCESSING_DELAY_MS?: number
  MODE?: Mode
  PERCENTAGE_FAIL?: number
  [key: string]: unknown
}

export interface RouterWorkerProfileOverride {
  workerUrl: string
  overrides?: WorkerOverrideFields
}

export interface RouterConfig {
  defaultOverrides?: WorkerOverrideFields
  workerProfiles?: RouterWorkerProfileOverride[]
}

export interface WorkerOverrides extends WorkerOverrideFields {
  routerConfig?: RouterConfig
}

export interface WorkerErrorProfile {
  workerUrl: string
  mode: Mode
  failureRate?: number
  processingDelayMs?: number
}

export interface TestConfig {
  algo: Algorithm
  overrides: WorkerOverrides
  customHeaders?: Record<string, string>
}

export interface TestResult {
  id: string
  timestamp: number
  config: TestConfig
  status: number
  statusText: string
  responseBody: string
  latency: number
  workerUrl: string | null
  algoUsed: string | null
  headers: Record<string, string>
  success: boolean
  error?: string
  profileOverrides?: {
    workerUrl?: string | null
    mode?: Mode
    failureRate?: number
    processingDelayMs?: number
  }
}

export interface StressTestConfig {
  totalRequests: number
  concurrency: number
  algo: Algorithm
  overrides: WorkerOverrides
  rampUp?: boolean
  rampUpDuration?: number
  workerProfiles?: WorkerErrorProfile[]
}

export interface StressTestProgress {
  completed: number
  total: number
  successCount: number
  failureCount: number
  avgLatency: number
  minLatency: number
  maxLatency: number
  requestsPerSecond: number
  elapsedSeconds: number
}
