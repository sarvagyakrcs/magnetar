import { NextRequest, NextResponse } from "next/server"

const BASE_URL = process.env.MAGNETAR_ROUTER_URL ?? "https://magnetar-router.chiefsarvagya.workers.dev"

type ProxyPayload = {
  path?: string
  method?: string
  headers?: Record<string, string | undefined>
  body?: unknown
}

const buildTargetUrl = (path: string | undefined) => {
  const trimmedPath = path?.trim()
  if (!trimmedPath) {
    return `${BASE_URL}/service`
  }

  try {
    const url = new URL(trimmedPath, BASE_URL)
    return url.toString()
  } catch {
    return `${BASE_URL}/service`
  }
}

const createUpstreamHeaders = (headers: ProxyPayload["headers"], hasBody: boolean) => {
  const upstreamHeaders = new Headers()

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined || value === null) continue
      if (key.toLowerCase() === "host") continue
      upstreamHeaders.set(key, String(value))
    }
  }

  if (hasBody && !upstreamHeaders.has("content-type")) {
    upstreamHeaders.set("content-type", "application/json")
  }

  return upstreamHeaders
}

const serialiseBody = (body: ProxyPayload["body"]) => {
  if (body === undefined || body === null) {
    return undefined
  }

  if (typeof body === "string") {
    return body
  }

  try {
    return JSON.stringify(body)
  } catch {
    return undefined
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as ProxyPayload
    const targetUrl = buildTargetUrl(payload.path)
    const body = serialiseBody(payload.body)
    const headers = createUpstreamHeaders(payload.headers, body !== undefined)

    const response = await fetch(targetUrl, {
      method: payload.method ?? "POST",
      headers,
      body,
    })

    const text = await response.text()
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    return NextResponse.json(
      {
        status: response.status,
        statusText: response.statusText,
        body: text,
        headers: responseHeaders,
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

