"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Send, Clock, Copy, CheckCircle2, XCircle } from "lucide-react"

interface InspectorResult {
  status: number
  statusText: string
  body: string
  headers: Record<string, string>
  latency: number
  timestamp: number
}

export function RequestInspector() {
  const [requestBody, setRequestBody] = useState(`{
  "algo": "roundRobin",
  "PROCESSING_DELAY_MS": 100,
  "MODE": "All_Success"
}`)
  const [requestHeaders, setRequestHeaders] = useState(`{
  "Content-Type": "application/json"
}`)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<InspectorResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSend = async () => {
    setIsLoading(true)
    setError(null)

    const startTime = performance.now()

    try {
      const headers: Record<string, string> = {}
      try {
        const parsedHeaders = JSON.parse(requestHeaders) as Record<string, unknown>
        Object.entries(parsedHeaders).forEach(([key, value]) => {
          if (value === undefined || value === null) return
          headers[key] = String(value)
        })
      } catch {
        throw new Error("Invalid headers JSON")
      }

      const body = requestBody.trim()
      if (body) {
        try {
          JSON.parse(body)
        } catch {
          throw new Error("Invalid body JSON")
        }
      }

      const proxyResponse = await fetch("/api/router-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "/service",
          method: "POST",
          headers,
          ...(body ? { body } : {}),
        }),
      })

      const endTime = performance.now()
      const payload = await proxyResponse.json()

      if (!proxyResponse.ok) {
        throw new Error(payload.error ?? "Failed to reach router service")
      }

      const responseHeaders: Record<string, string> = payload.headers ?? {}
      setResult({
        status: payload.status ?? 0,
        statusText: payload.statusText ?? "",
        body: payload.body ?? "",
        headers: responseHeaders,
        latency: Math.round(endTime - startTime),
        timestamp: Date.now(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Request Panel */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Request Builder</CardTitle>
          <CardDescription>Craft custom requests with full control</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50">
            <Badge className="bg-[oklch(0.65_0.2_35)] text-[oklch(0.13_0.005_260)]">POST</Badge>
            <code className="text-sm font-mono text-foreground flex-1 truncate">/service</code>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Headers</Label>
            <Textarea
              value={requestHeaders}
              onChange={(e) => setRequestHeaders(e.target.value)}
              className="font-mono text-sm bg-input border-border h-24"
              placeholder='{"Content-Type": "application/json"}'
            />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Body</Label>
            <Textarea
              value={requestBody}
              onChange={(e) => setRequestBody(e.target.value)}
              className="font-mono text-sm bg-input border-border h-48"
              placeholder='{"algo": "roundRobin"}'
            />
          </div>

          <Button onClick={handleSend} disabled={isLoading} className="w-full bg-primary text-primary-foreground">
            <Send className="mr-2 h-4 w-4" />
            {isLoading ? "Sending..." : "Send Request"}
          </Button>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Response Panel */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Response Inspector</CardTitle>
          <CardDescription>Detailed response analysis</CardDescription>
        </CardHeader>
        <CardContent>
          {result ? (
            <div className="space-y-4">
              {/* Status & Latency */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {result.status < 400 ? (
                    <CheckCircle2 className="h-5 w-5 text-[oklch(0.7_0.18_145)]" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )}
                  <span className="font-mono text-lg text-foreground">
                    {result.status} {result.statusText}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {result.latency}ms
                </div>
              </div>

              <Tabs defaultValue="headers" className="w-full">
                <TabsList className="w-full bg-secondary/50 border border-border">
                  <TabsTrigger value="headers" className="flex-1 data-[state=active]:bg-card">
                    Headers
                  </TabsTrigger>
                  <TabsTrigger value="body" className="flex-1 data-[state=active]:bg-card">
                    Body
                  </TabsTrigger>
                  <TabsTrigger value="meta" className="flex-1 data-[state=active]:bg-card">
                    Metadata
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="headers" className="mt-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Response Headers</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(JSON.stringify(result.headers, null, 2))}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-3 max-h-80 overflow-auto">
                      {Object.entries(result.headers).map(([key, value]) => (
                        <div key={key} className="flex gap-2 py-1 text-sm border-b border-border/50 last:border-0">
                          <span className="text-primary font-mono">{key}:</span>
                          <span className="text-foreground font-mono break-all">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="body" className="mt-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Response Body</Label>
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(result.body)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <pre className="rounded-lg bg-secondary/50 p-3 text-sm font-mono overflow-auto max-h-80 text-foreground">
                      {result.body || "(empty)"}
                    </pre>
                  </div>
                </TabsContent>

                <TabsContent value="meta" className="mt-4">
                  <div className="space-y-4">
                    <div className="rounded-lg bg-secondary/50 p-4 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Worker URL</span>
                        <code className="font-mono text-foreground text-xs">
                          {result.headers["x-magnetar-worker-url"] || "N/A"}
                        </code>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Algorithm Used</span>
                        <code className="font-mono text-foreground">{result.headers["x-algo-used"] || "N/A"}</code>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Timestamp</span>
                        <code className="font-mono text-foreground">{new Date(result.timestamp).toISOString()}</code>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Content-Type</span>
                        <code className="font-mono text-foreground">{result.headers["content-type"] || "N/A"}</code>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Send className="h-12 w-12 mb-4 opacity-20" />
              <p>No response yet</p>
              <p className="text-sm">Send a request to inspect the response</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
