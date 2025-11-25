import { Hono, type Context } from 'hono'
import type { Bindings } from './types/bindings'
import type { BodyType } from './types/body'
import { getRedisClient } from './lib/upstash'
import { getWorkerUrl } from './help'

type Algo = NonNullable<BodyType['algo']>

const DEFAULT_ALGO: Algo = 'roundRobin'

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

const app = new Hono<{ Bindings: Bindings }>()


app.all("*", async (c) => {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = c.env
  const redis = getRedisClient(UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN)

  const forwardHeaders = new Headers(c.req.raw.headers)
  forwardHeaders.delete("content-length")
  const method = c.req.method.toUpperCase()
  const hasRequestBody = method !== "GET" && method !== "HEAD"

  let bodyAlgo: Algo | undefined
  let forwardBody: string | ReadableStream | null | undefined

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
      const { algo: parsedAlgo, ...workerPayload } = parsedBody
      bodyAlgo = parsedAlgo ?? undefined
      if (Object.keys(workerPayload).length > 0) {
        forwardBody = JSON.stringify(workerPayload)
        forwardHeaders.set("content-type", "application/json")
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

  const incomingUrl = new URL(c.req.url)
  const targetBase = workerUrl.replace(/\/$/, "")
  const targetUrl = `${targetBase}${incomingUrl.pathname}${incomingUrl.search}`

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
  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  })
})

export default app
