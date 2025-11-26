type Mode = "All_Success" | "All_fail" | "percentage_fail"

type WorkerOverrideFields = {
    PROCESSING_DELAY_MS?: number
    MODE?: Mode
    PERCENTAGE_FAIL?: number
}

type WorkerPayload = WorkerOverrideFields & {
    [key: string]: unknown
}

type WorkerProfileOverride = {
    workerUrl: string
    overrides?: WorkerOverrideFields
}

type RouterConfig = {
    defaultOverrides?: WorkerOverrideFields
    workerProfiles?: WorkerProfileOverride[]
}

export type BodyType = WorkerPayload & {
    algo?: "roundRobin" | "random" | "proprietry"
    routerConfig?: RouterConfig
}