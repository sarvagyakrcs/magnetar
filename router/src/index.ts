import { Hono, type Context } from 'hono'
import type { Bindings } from './types/bindings'
import type { BodyType } from './types/body'
import { avalibleWorkers } from './constants'
import { getWorkerUrl } from './help'
import { collectRoutingTelemetry, type RoutingTelemetryRecord } from './lb/telemetry'
import { buildKafkaTopicUrl, produceKafkaJson } from './lib/kafka'
import { getRedisClient } from './lib/upstash'

type Algo = NonNullable<BodyType['algo']>

const DEFAULT_ALGO: Algo = 'roundRobin'
const TELEMETRY_TOPIC = 'telemetry'
type WorkerProfiles = NonNullable<NonNullable<BodyType['routerConfig']>['workerProfiles']>
const normalizeWorkerUrl = (url: string | undefined | null) => {
  if (!url) return ''
  return url.trim().replace(/\/+$/, '')
}

const getWorkerProfileOverrides = (
  workerUrl: string,
  profiles: WorkerProfiles | undefined
): Record<string, unknown> | undefined => {
  if (!profiles || profiles.length === 0) {
    return undefined
  }
  const normalizedWorkerUrl = normalizeWorkerUrl(workerUrl)
  for (const profile of profiles) {
    if (!profile?.workerUrl) continue
    if (normalizeWorkerUrl(profile.workerUrl) === normalizedWorkerUrl) {
      return profile.overrides ?? undefined
    }
  }
  return undefined
}


const isAlgo = (value: string | null | undefined): value is Algo =>
  value === 'roundRobin' || value === 'random' || value === 'proprietry'

type MagnetarContext = Context<{ Bindings: Bindings }>

const getRequestedAlgo = (c: MagnetarContext) => {
  const queryParam = c.req.query('algo')
  if (isAlgo(queryParam)) {
    return queryParam
  }
  const headerValue = c.req.header('x-magnetar-algo')
  if (isAlgo(headerValue)) {
    return headerValue
  }
  return DEFAULT_ALGO
}

const publishRoutingTelemetry = async (
  env: Bindings,
  telemetry: RoutingTelemetryRecord
) => {
  const kafkaBaseUrl = env.KAFKA_URL
  if (!kafkaBaseUrl) {
    console.warn('KAFKA_URL is not configured; skipping telemetry publish')
    return
  }
  const endpoint = buildKafkaTopicUrl(kafkaBaseUrl, TELEMETRY_TOPIC)
  await produceKafkaJson(endpoint, {
    records: [
      {
        key: telemetry.telemetryId,
        value: telemetry,
      },
    ],
  })
}

const app = new Hono<{ Bindings: Bindings }>()


app.all("*", async (c) => {
  const requestStart = Date.now()
  const requestId = crypto.randomUUID()
  const originalUrl = c.req.url
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = c.env
  const redis = getRedisClient(UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN)

  const forwardHeaders = new Headers(c.req.raw.headers)
  forwardHeaders.delete("content-length")
  const method = c.req.method.toUpperCase()
  const hasRequestBody = method !== "GET" && method !== "HEAD"
  const inboundContentLengthHeader = c.req.header("content-length")

  let bodyAlgo: Algo | undefined
  let forwardBody: string | ReadableStream | null | undefined
  let workerPayload: Record<string, unknown> | undefined
  let parsedJsonBody = false
  let baseWorkerPayload: Record<string, unknown> | undefined
  let routerConfig: BodyType["routerConfig"]

  if (hasRequestBody) {
    const contentType = c.req.header("content-type") ?? ""
    if (contentType.includes("application/json")) {
      let parsedBody: BodyType
      try {
        parsedBody = await c.req.json<BodyType>()
      } catch (error) {
        if ((error as Error).message === "Unexpected end of JSON input") {
          parsedBody = {}
        } else {
          return c.json({ error: "Invalid JSON payload" }, 400)
        }
      }
      parsedJsonBody = true
      const { algo: parsedAlgo, routerConfig: parsedRouterConfig, ...workerPayloadFields } = parsedBody
      bodyAlgo = parsedAlgo ?? undefined
      routerConfig = parsedRouterConfig
      if (Object.keys(workerPayloadFields).length > 0) {
        baseWorkerPayload = workerPayloadFields
      }
    } else {
      forwardBody = c.req.raw.body ?? undefined
    }
  }

  const algo = bodyAlgo ?? getRequestedAlgo(c)
  const workerUrl = await getWorkerUrl(algo, redis)
  if (workerUrl === "") {
    return c.json({ error: "No worker url found" }, 500)
  }

  const incomingUrl = new URL(originalUrl)
  const targetBase = workerUrl.replace(/\/$/, "")
  const targetUrl = `${targetBase}${incomingUrl.pathname}${incomingUrl.search}`

  const mergeOverrides = (
    base: Record<string, unknown> | undefined,
    overrides?: Record<string, unknown>
  ) => {
    if (!overrides || Object.keys(overrides).length === 0) {
      return base
    }
    return {
      ...(base ?? {}),
      ...overrides,
    }
  }

  let finalWorkerPayload: Record<string, unknown> | undefined = baseWorkerPayload

  if (parsedJsonBody) {
    finalWorkerPayload = mergeOverrides(finalWorkerPayload, routerConfig?.defaultOverrides)
    const workerSpecificOverrides = getWorkerProfileOverrides(workerUrl, routerConfig?.workerProfiles)
    finalWorkerPayload = mergeOverrides(finalWorkerPayload, workerSpecificOverrides)
  }

  if (parsedJsonBody && finalWorkerPayload && Object.keys(finalWorkerPayload).length > 0) {
    forwardBody = JSON.stringify(finalWorkerPayload)
    forwardHeaders.set("content-type", "application/json")
    workerPayload = finalWorkerPayload
  } else if (baseWorkerPayload) {
    workerPayload = baseWorkerPayload
  }

  let response: Response
  try {
    response = await fetch(targetUrl, {
      method,
      headers: forwardHeaders,
      body: forwardBody,
    })
  } catch (error) {
    return c.json(
      { error: "Failed to forward request", details: (error as Error).message },
      502
    )
  }

  const responseHeaders = new Headers(response.headers)
  responseHeaders.set("x-magnetar-worker-url", workerUrl)
  responseHeaders.set("x-algo-used", algo)

  const parseContentLength = (value?: string | null) => {
    if (!value) {
      return undefined
    }
    const parsed = Number.parseInt(value, 10)
    return Number.isNaN(parsed) ? undefined : parsed
  }

  const telemetryRecord = collectRoutingTelemetry({
    context: {
      requestId,
      method,
      path: incomingUrl.pathname,
      query: incomingUrl.search || undefined,
      clientId: c.req.header("x-magnetar-client-id") ?? undefined,
      hasRequestBody,
      payloadBytes: parseContentLength(inboundContentLengthHeader),
    },
    decision: {
      algo,
      workerUrl,
      targetUrl,
      workerCount: avalibleWorkers.length,
    },
    outcome: {
      statusCode: response.status,
      latencyMs: Date.now() - requestStart,
    },
  })

  console.log("routingTelemetry", telemetryRecord)

  const telemetryPromise = (async () => {
    try {
      await publishRoutingTelemetry(c.env, telemetryRecord)
    } catch (error) {
      console.error("Failed to publish telemetry to Kafka", error)
    }
  })()

  if (c.executionCtx) {
    c.executionCtx.waitUntil(telemetryPromise)
  } else {
    await telemetryPromise
  }

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  })
})

export default app
