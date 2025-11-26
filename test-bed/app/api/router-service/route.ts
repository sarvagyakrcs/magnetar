import { NextRequest, NextResponse } from "next/server"
import { ROUTER_SERVICE_PATH, getRouterUrl } from "@/constants"

const resolveBaseUrl = (override?: string) => {
  const trimmed = override?.trim()
  if (trimmed) {
    return trimmed
  }
  return getRouterUrl()
}

type ProxyPayload = {
  path?: string
  method?: string
  headers?: Record<string, string | undefined>
  body?: unknown
  routerUrl?: string
}

const buildTargetUrl = (path: string | undefined, baseUrl: string) => {
  const trimmedPath = path?.trim()
  if (!trimmedPath) {
    return `${baseUrl}${ROUTER_SERVICE_PATH}`
  }

  try {
    const url = new URL(trimmedPath, baseUrl)
    return url.toString()
  } catch {
    return `${baseUrl}${ROUTER_SERVICE_PATH}`
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
    const baseUrl = resolveBaseUrl(payload.routerUrl)
    const targetUrl = buildTargetUrl(payload.path, baseUrl)
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

