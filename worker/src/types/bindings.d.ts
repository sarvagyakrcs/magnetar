export type Mode = "All_Success" | "All_fail" | "percentage_fail"

export interface Bindings {
  PROCESSING_DELAY_MS: number
  MODE: Mode
  PERCENTAGE_FAIL: number
}

export type WorkerOverrides = Partial<Bindings>