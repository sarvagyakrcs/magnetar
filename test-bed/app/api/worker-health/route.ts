import { NextRequest, NextResponse } from "next/server"

const normalizeWorkerUrl = (rawUrl: string) => {
  const trimmed = rawUrl.trim()
  if (!trimmed) return ""
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed
}

export async function POST(req: NextRequest) {
  try {
    const { url } = (await req.json()) as { url?: string }
    if (!url) {
      return NextResponse.json({ ok: false, error: "Missing worker url" }, { status: 400 })
    }

    const baseUrl = normalizeWorkerUrl(url)
    if (!baseUrl) {
      return NextResponse.json({ ok: false, error: "Invalid worker url" }, { status: 400 })
    }

    const target = `${baseUrl}/ping`
    const start = performance.now()

    try {
      const response = await fetch(target, { method: "GET" })
      const latency = Math.round(performance.now() - start)
      return NextResponse.json({
        ok: response.ok,
        status: response.status,
        latency,
        target,
      })
    } catch (error) {
      return NextResponse.json({
        ok: false,
        latency: Math.round(performance.now() - start),
        target,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

