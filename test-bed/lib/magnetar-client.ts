import type { TestConfig, TestResult, Algorithm, WorkerErrorProfile, Mode } from "./types"
import { AVAILABLE_WORKERS, ROUTER_SERVICE_PATH } from "@/constants"

const PROXY_ENDPOINT = "/api/router-service"

interface AppliedProfileOverrides {
  workerUrl?: string | null
  mode?: Mode
  failureRate?: number
  processingDelayMs?: number
}

interface RunTestOptions {
  targetUrl?: string
  routerUrlOverride?: string
  workerUrlOverride?: string | null
  algoLabelOverride?: string | null
  profileOverrides?: AppliedProfileOverrides
}

interface StressTestOptions {
  routerUrlOverride?: string
}

const ensureServicePath = (url: string) => {
  if (!url) return ROUTER_SERVICE_PATH
  try {
    const parsed = new URL(url)
    if (!parsed.pathname.endsWith(ROUTER_SERVICE_PATH)) {
      const normalizedPath = parsed.pathname.replace(/\/$/, "")
      parsed.pathname = `${normalizedPath}${ROUTER_SERVICE_PATH}`
    }
    return parsed.toString()
  } catch {
    const trimmed = url.endsWith("/") ? url.slice(0, -1) : url
    const base = trimmed || ROUTER_SERVICE_PATH
    return base.endsWith(ROUTER_SERVICE_PATH) ? base : `${base}${ROUTER_SERVICE_PATH}`
  }
}

export async function runTest(config: TestConfig, options?: RunTestOptions): Promise<TestResult> {
  const id = crypto.randomUUID()
  const timestamp = Date.now()

  const body: Record<string, unknown> = { ...config.overrides }

  const targetUrl = options?.targetUrl ? ensureServicePath(options.targetUrl) : ROUTER_SERVICE_PATH
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
        routerUrl: options?.routerUrlOverride,
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

const normalizeUrl = (url: string | null | undefined) => {
  if (!url) return ""
  return url.trim().replace(/\/+$/, "")
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

  const routerProfileOverrides = Array.isArray(config.overrides.routerConfig?.workerProfiles)
    ? config.overrides.routerConfig?.workerProfiles
    : undefined

  const findProfileForWorker = (workerUrl: string | null | undefined) => {
    if (!routerProfileOverrides?.length || !workerUrl) return undefined
    const normalizedWorker = normalizeUrl(workerUrl)
    return routerProfileOverrides.find(
      (profile) => normalizeUrl(profile.workerUrl) === normalizedWorker,
    )
  }

  const runBatch = async () => {
    while (completed < totalRequests) {
      const batchSize = Math.min(concurrency, totalRequests - completed)
      const promises = Array.from({ length: batchSize }, () =>
        runTest(config, {
          routerUrlOverride: options?.routerUrlOverride,
        }),
      )
      const batchResults = await Promise.all(promises)

      if (routerProfileOverrides?.length) {
        batchResults.forEach((result) => {
          const matchedProfile = findProfileForWorker(result.workerUrl)
          if (!matchedProfile?.overrides) {
            return
          }
          const overrides = matchedProfile.overrides
          result.profileOverrides = {
            workerUrl: matchedProfile.workerUrl,
            mode: overrides.MODE as Mode | undefined,
            failureRate:
              typeof overrides.PERCENTAGE_FAIL === "number"
                ? overrides.PERCENTAGE_FAIL
                : undefined,
            processingDelayMs:
              typeof overrides.PROCESSING_DELAY_MS === "number"
                ? overrides.PROCESSING_DELAY_MS
                : undefined,
          }
        })
      }

      results.push(...batchResults)
      completed += batchSize
      onProgress?.(completed, batchResults)
    }
  }

  await runBatch()
  return results
}

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
