import type { TestConfig, TestResult, Algorithm, WorkerErrorProfile, Mode } from "./types"

const PROXY_ENDPOINT = "/api/router-service"

interface AppliedProfileOverrides {
  workerUrl?: string | null
  mode?: Mode
  failureRate?: number
  processingDelayMs?: number
}

interface RunTestOptions {
  targetUrl?: string
  workerUrlOverride?: string | null
  algoLabelOverride?: string | null
  profileOverrides?: AppliedProfileOverrides
}

interface StressTestOptions {
  workerProfiles?: WorkerErrorProfile[]
}

const ensureServicePath = (url: string) => {
  if (!url) return "/service"
  try {
    const parsed = new URL(url)
    parsed.pathname = parsed.pathname.endsWith("/service") ? parsed.pathname : `${parsed.pathname.replace(/\/$/, "")}/service`
    return parsed.toString()
  } catch {
    const trimmed = url.endsWith("/") ? url.slice(0, -1) : url
    return `${trimmed || "/service"}${trimmed.endsWith("/service") ? "" : "/service"}`
  }
}

export async function runTest(config: TestConfig, options?: RunTestOptions): Promise<TestResult> {
  const id = crypto.randomUUID()
  const timestamp = Date.now()

  const body: Record<string, unknown> = { ...config.overrides }

  const targetUrl = options?.targetUrl ? ensureServicePath(options.targetUrl) : "/service"
  const isDirectTarget = targetUrl.startsWith("http")

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config.customHeaders,
  }

  if (!isDirectTarget) {
    headers["x-magnetar-algo"] = config.algo
  }

  const startTime = performance.now()

  try {
    const proxyResponse = await fetch(PROXY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: targetUrl,
        method: "POST",
        headers,
        body,
      }),
    })

    const proxyPayload = await proxyResponse.json()
    const endTime = performance.now()
    const latency = Math.round(endTime - startTime)
    const responseHeaders: Record<string, string> = proxyPayload.headers ?? {}
    const status: number = proxyPayload.status ?? 0
    const statusText: string = proxyPayload.statusText ?? ""
    const responseBody: string = proxyPayload.body ?? ""

    if (!proxyResponse.ok) {
      return {
        id,
        timestamp,
        config,
        status: 0,
        statusText: "Network Error",
        responseBody: "",
        latency,
        workerUrl: options?.workerUrlOverride ?? null,
        algoUsed: options?.algoLabelOverride ?? (isDirectTarget ? "direct" : config.algo),
        headers: {},
        success: false,
        error: proxyPayload.error ?? "Failed to reach router service",
        profileOverrides: options?.profileOverrides,
      }
    }

    const workerUrl = responseHeaders["x-magnetar-worker-url"] ?? options?.workerUrlOverride ?? (isDirectTarget ? targetUrl : null)
    const algoUsed =
      responseHeaders["x-algo-used"] ?? options?.algoLabelOverride ?? (isDirectTarget ? "direct" : config.algo)
    const success = status >= 200 && status < 300
    return {
      id,
      timestamp,
      config,
      status,
      statusText,
      responseBody,
      latency,
      workerUrl,
      algoUsed,
      headers: responseHeaders,
      success,
      profileOverrides: options?.profileOverrides,
    }
  } catch (error) {
    const endTime = performance.now()
    return {
      id,
      timestamp,
      config,
      status: 0,
      statusText: "Network Error",
      responseBody: "",
      latency: Math.round(endTime - startTime),
      workerUrl: options?.workerUrlOverride ?? null,
      algoUsed: options?.algoLabelOverride ?? (options?.targetUrl?.startsWith("http") ? "direct" : config.algo),
      headers: {},
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      profileOverrides: options?.profileOverrides,
    }
  }
}

export async function runBatchTest(
  config: TestConfig,
  count: number,
  onProgress?: (completed: number) => void,
): Promise<TestResult[]> {
  const results: TestResult[] = []

  for (let i = 0; i < count; i++) {
    const result = await runTest(config)
    results.push(result)
    onProgress?.(i + 1)
  }

  return results
}

export async function runStressTest(
  config: TestConfig,
  totalRequests: number,
  concurrency: number,
  onProgress?: (completed: number, results: TestResult[]) => void,
  options?: StressTestOptions,
): Promise<TestResult[]> {
  const results: TestResult[] = []
  let completed = 0

  const workerProfiles =
    options?.workerProfiles?.filter((profile) => Boolean(profile.workerUrl)) ?? []
  const hasWorkerProfiles = workerProfiles.length > 0

  const profileEntries = hasWorkerProfiles
    ? workerProfiles.map((profile) => {
        const trimmedUrl = profile.workerUrl.endsWith("/")
          ? profile.workerUrl.slice(0, -1)
          : profile.workerUrl
        const failureRate = Math.max(0, Math.min(100, Math.round(profile.failureRate ?? 0)))
        const requestUrl = ensureServicePath(trimmedUrl)
        return {
          displayUrl: trimmedUrl,
          requestUrl,
          failureRate,
          mode: profile.mode,
          processingDelayMs: profile.processingDelayMs,
        }
      })
    : []

  let requestIndex = 0

  const runBatch = async () => {
    while (completed < totalRequests) {
      const batchSize = Math.min(concurrency, totalRequests - completed)
      const promises = Array.from({ length: batchSize }, () => {
        if (hasWorkerProfiles) {
          const profile = profileEntries[requestIndex % profileEntries.length]
          requestIndex += 1
          const overrides = {
            ...config.overrides,
            MODE: profile.mode,
            PROCESSING_DELAY_MS:
              profile.processingDelayMs ?? config.overrides.PROCESSING_DELAY_MS,
            PERCENTAGE_FAIL: profile.mode === "percentage_fail" ? profile.failureRate : undefined,
          }
          const profileConfig: TestConfig = {
            ...config,
            overrides,
          }
          return runTest(profileConfig, {
            targetUrl: profile.requestUrl,
            workerUrlOverride: profile.displayUrl,
            algoLabelOverride: "worker-profile",
            profileOverrides: {
              workerUrl: profile.displayUrl,
              mode: profile.mode,
              failureRate: profile.mode === "percentage_fail" ? profile.failureRate : undefined,
              processingDelayMs: profile.processingDelayMs,
            },
          })
        }
        return runTest(config)
      })
      const batchResults = await Promise.all(promises)
      results.push(...batchResults)
      completed += batchSize
      onProgress?.(completed, batchResults)
    }
  }

  await runBatch()
  return results
}

export const AVAILABLE_WORKERS = [
  "https://worker.apshabd.workers.dev/",
  "https://worker2.apshabd.workers.dev",
  "https://worker3.apshabd.workers.dev",
]

export const ALGORITHMS: { value: Algorithm; label: string; description: string }[] = [
  { value: "roundRobin", label: "Round Robin", description: "Cycles through workers sequentially using Redis state" },
  { value: "random", label: "Random", description: "Picks a random worker each request" },
  { value: "proprietry", label: "Proprietary", description: "Always routes to worker index 2" },
]

export const MODES: { value: string; label: string; description: string }[] = [
  { value: "All_Success", label: "All Success", description: "Worker always returns 200 OK" },
  { value: "All_fail", label: "All Fail", description: "Worker always returns 500 error" },
  { value: "percentage_fail", label: "Percentage Fail", description: "Worker fails at configured percentage" },
]
