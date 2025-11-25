type Mode = "All_Success" | "All_fail" | "percentage_fail"

type WorkerOverrides = {
    PROCESSING_DELAY_MS?: number
    MODE?: Mode
    PERCENTAGE_FAIL?: number
    [key: string]: unknown
}

export type BodyType = WorkerOverrides & {
    algo?: "roundRobin" | "random" | "proprietry"
}