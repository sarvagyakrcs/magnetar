"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ROUTER_SERVICE_PATH, getRouterUrl } from "@/constants"
import { runTest, runBatchTest, ALGORITHMS, MODES } from "@/lib/magnetar-client"
import type { TestConfig, TestResult, Algorithm, Mode } from "@/lib/types"
import { Play, RotateCcw, Loader2, Clock, CheckCircle2, XCircle, Copy, ChevronDown, ChevronUp } from "lucide-react"

interface TestRunnerProps {
  onResult: (result: TestResult) => void
  isRunning: boolean
  setIsRunning: (running: boolean) => void
}

export function TestRunner({ onResult, isRunning, setIsRunning }: TestRunnerProps) {
  const [algo, setAlgo] = useState<Algorithm>("roundRobin")
  const [mode, setMode] = useState<Mode>("All_Success")
  const [delayMs, setDelayMs] = useState(0)
  const [percentageFail, setPercentageFail] = useState(20)
  const [batchCount, setBatchCount] = useState(1)
  const [batchMode, setBatchMode] = useState(false)
  const [progress, setProgress] = useState(0)
  const [lastResult, setLastResult] = useState<TestResult | null>(null)
  const [customHeaders, setCustomHeaders] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)

  const buildConfig = (): TestConfig => {
    const headers: Record<string, string> = {}
    if (customHeaders.trim()) {
      try {
        const parsed = JSON.parse(customHeaders) as Record<string, unknown>
        Object.entries(parsed).forEach(([key, value]) => {
          if (value === undefined || value === null) return
          headers[key] = String(value)
        })
      } catch {
        // Ignore invalid JSON
      }
    }

    return {
      algo,
      overrides: {
        MODE: mode,
        PROCESSING_DELAY_MS: delayMs > 0 ? delayMs : undefined,
        PERCENTAGE_FAIL: mode === "percentage_fail" ? percentageFail : undefined,
      },
      customHeaders: Object.keys(headers).length > 0 ? headers : undefined,
    }
  }

  const handleRun = async () => {
    setIsRunning(true)
    setProgress(0)
    const config = buildConfig()

    try {
      if (batchMode && batchCount > 1) {
        const results = await runBatchTest(config, batchCount, (completed) => {
          setProgress(completed)
        })
        results.forEach(onResult)
        setLastResult(results[results.length - 1])
      } else {
        const result = await runTest(config)
        onResult(result)
        setLastResult(result)
        setProgress(1)
      }
    } finally {
      setIsRunning(false)
    }
  }

  const copyAsCurl = () => {
    const config = buildConfig()
    const body = JSON.stringify(config.overrides, null, 2)
    const routerUrl = getRouterUrl({ preferLocalFallback: true })
    const curl = `curl -X POST ${routerUrl}${ROUTER_SERVICE_PATH} \\
  -H 'Content-Type: application/json' \\
  -H 'x-magnetar-algo: ${config.algo}' \\
  -d '${body}'`
    navigator.clipboard.writeText(curl)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Configuration Panel */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Test Configuration</CardTitle>
          <CardDescription>Configure your test parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Algorithm Selection */}
          <div className="space-y-2">
            <Label className="text-foreground">Routing Algorithm</Label>
            <Select value={algo} onValueChange={(v) => setAlgo(v as Algorithm)}>
              <SelectTrigger className="bg-input border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALGORITHMS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    <div className="flex flex-col">
                      <span>{a.label}</span>
                      <span className="text-xs text-muted-foreground">{a.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mode Selection */}
          <div className="space-y-2">
            <Label className="text-foreground">Worker Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger className="bg-input border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <div className="flex flex-col">
                      <span>{m.label}</span>
                      <span className="text-xs text-muted-foreground">{m.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Percentage Fail Slider */}
          {mode === "percentage_fail" && (
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-foreground">Failure Percentage</Label>
                <span className="text-sm text-muted-foreground">{percentageFail}%</span>
              </div>
              <Slider
                value={[percentageFail]}
                onValueChange={([v]) => setPercentageFail(v)}
                max={100}
                step={5}
                className="py-2"
              />
            </div>
          )}

          {/* Processing Delay */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-foreground">Processing Delay</Label>
              <span className="text-sm text-muted-foreground">{delayMs}ms</span>
            </div>
            <Slider value={[delayMs]} onValueChange={([v]) => setDelayMs(v)} max={2000} step={50} className="py-2" />
          </div>

          {/* Batch Mode */}
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <Label className="text-foreground">Batch Mode</Label>
              <p className="text-sm text-muted-foreground">Run multiple requests sequentially</p>
            </div>
            <Switch checked={batchMode} onCheckedChange={setBatchMode} />
          </div>

          {batchMode && (
            <div className="space-y-2">
              <Label className="text-foreground">Batch Size</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={batchCount}
                onChange={(e) => setBatchCount(Number.parseInt(e.target.value) || 1)}
                className="bg-input border-border"
              />
            </div>
          )}

          {/* Advanced Options */}
          <div className="space-y-4">
            <Button
              variant="ghost"
              className="w-full justify-between text-muted-foreground"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              Advanced Options
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {showAdvanced && (
              <div className="space-y-2">
                <Label className="text-foreground">Custom Headers (JSON)</Label>
                <Textarea
                  value={customHeaders}
                  onChange={(e) => setCustomHeaders(e.target.value)}
                  placeholder='{"X-Custom-Header": "value"}'
                  className="font-mono text-sm bg-input border-border"
                  rows={3}
                />
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleRun}
              disabled={isRunning}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {batchMode ? `${progress}/${batchCount}` : "Running..."}
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  {batchMode ? `Run ${batchCount} Tests` : "Run Test"}
                </>
              )}
            </Button>
            <Button variant="outline" size="icon" onClick={copyAsCurl} className="border-border bg-transparent">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Result Panel */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Last Result</CardTitle>
          <CardDescription>Response details from the most recent request</CardDescription>
        </CardHeader>
        <CardContent>
          {lastResult ? (
            <div className="space-y-4">
              {/* Status Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {lastResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-[oklch(0.7_0.18_145)]" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )}
                  <span className="font-medium text-foreground">
                    {lastResult.status} {lastResult.statusText}
                  </span>
                </div>
                <Badge
                  variant={lastResult.success ? "default" : "destructive"}
                  className={lastResult.success ? "bg-[oklch(0.7_0.18_145)] text-[oklch(0.13_0.005_260)]" : ""}
                >
                  {lastResult.success ? "Success" : "Failed"}
                </Badge>
              </div>

              {/* Latency */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>
                  Latency: <span className="text-foreground font-mono">{lastResult.latency}ms</span>
                </span>
              </div>

              {/* Router Headers */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Router Headers</Label>
                <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Worker URL</span>
                    <code className="font-mono text-xs text-foreground truncate max-w-[300px]">
                      {lastResult.workerUrl || "N/A"}
                    </code>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Algorithm Used</span>
                    <code className="font-mono text-xs text-foreground">{lastResult.algoUsed || "N/A"}</code>
                  </div>
                </div>
              </div>

              {/* Response Body */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Response Body</Label>
                <pre className="rounded-lg bg-secondary/50 p-3 text-sm font-mono overflow-x-auto text-foreground">
                  {lastResult.responseBody || "(empty)"}
                </pre>
              </div>

              {/* All Headers */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">All Response Headers</Label>
                <pre className="rounded-lg bg-secondary/50 p-3 text-xs font-mono overflow-x-auto max-h-40 text-foreground">
                  {JSON.stringify(lastResult.headers, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <RotateCcw className="h-12 w-12 mb-4 opacity-20" />
              <p>No tests run yet</p>
              <p className="text-sm">Configure and run a test to see results</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
