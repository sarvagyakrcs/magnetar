"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Progress } from "@/components/ui/progress"
import { runStressTest, ALGORITHMS, MODES, AVAILABLE_WORKERS } from "@/lib/magnetar-client"
import type {
  TestConfig,
  TestResult,
  Algorithm,
  Mode,
  StressTestProgress,
  WorkerErrorProfile,
} from "@/lib/types"
import { Zap, Square, Loader2, TrendingUp, CheckCircle2, XCircle, Activity } from "lucide-react"
import { Switch } from "@/components/ui/switch"

interface StressTestProps {
  onResults: (results: TestResult[]) => void
  isRunning: boolean
  setIsRunning: (running: boolean) => void
}

export function StressTest({ onResults, isRunning, setIsRunning }: StressTestProps) {
  const [algo, setAlgo] = useState<Algorithm>("roundRobin")
  const [mode, setMode] = useState<Mode>("All_Success")
  const [delayMs, setDelayMs] = useState(0)
  const [percentageFail, setPercentageFail] = useState(20)
  const [totalRequests, setTotalRequests] = useState(100)
  const [concurrency, setConcurrency] = useState(10)
  const [progress, setProgress] = useState<StressTestProgress | null>(null)
  const abortRef = useRef(false)
  const startTimeRef = useRef(0)
  const [useWorkerProfiles, setUseWorkerProfiles] = useState(false)
  const [workerProfiles, setWorkerProfiles] = useState<WorkerErrorProfile[]>(
    AVAILABLE_WORKERS.map((workerUrl) => ({
      workerUrl,
      mode: "percentage_fail",
      failureRate: 20,
      processingDelayMs: 0,
    })),
  )

  useEffect(() => {
    if (useWorkerProfiles) {
      setMode("percentage_fail")
    }
  }, [useWorkerProfiles])

  const updateWorkerProfileMode = (index: number, newMode: Mode) => {
    setWorkerProfiles((current) =>
      current.map((profile, idx) =>
        idx === index
          ? {
              ...profile,
              mode: newMode,
              failureRate: newMode === "percentage_fail" ? profile.failureRate ?? 20 : undefined,
            }
          : profile,
      ),
    )
  }

  const updateWorkerProfileFailure = (index: number, failureRate: number) => {
    setWorkerProfiles((current) =>
      current.map((profile, idx) =>
        idx === index
          ? {
              ...profile,
              failureRate: Math.max(0, Math.min(100, failureRate)),
            }
          : profile,
      ),
    )
  }

  const updateWorkerProfileDelay = (index: number, processingDelayMs: number) => {
    setWorkerProfiles((current) =>
      current.map((profile, idx) =>
        idx === index
          ? {
              ...profile,
              processingDelayMs,
            }
          : profile,
      ),
    )
  }

  const workerProfilePayload = useWorkerProfiles
    ? workerProfiles.map((profile) => ({
        workerUrl: profile.workerUrl,
        mode: profile.mode,
        failureRate: profile.failureRate,
        processingDelayMs: profile.processingDelayMs,
      }))
    : undefined

  const formatWorkerLabel = (url: string) => {
    try {
      const { hostname } = new URL(url)
      return hostname.replace(".workers.dev", "")
    } catch {
      return url
    }
  }

  const handleStart = async () => {
    setIsRunning(true)
    abortRef.current = false
    startTimeRef.current = Date.now()

    const config: TestConfig = {
      algo,
      overrides: {
        MODE: useWorkerProfiles ? "percentage_fail" : mode,
        PROCESSING_DELAY_MS: useWorkerProfiles ? undefined : delayMs > 0 ? delayMs : undefined,
        PERCENTAGE_FAIL: useWorkerProfiles || mode !== "percentage_fail" ? undefined : percentageFail,
      },
    }

    const allResults: TestResult[] = []
    let minLatency = Number.POSITIVE_INFINITY
    let maxLatency = 0
    let totalLatency = 0
    let successCount = 0
    let failureCount = 0

    try {
      await runStressTest(
        config,
        totalRequests,
        concurrency,
        (completed, batchResults) => {
          if (abortRef.current) return

          allResults.push(...batchResults)

          batchResults.forEach((r) => {
            if (r.success) successCount++
            else failureCount++
            totalLatency += r.latency
            minLatency = Math.min(minLatency, r.latency)
            maxLatency = Math.max(maxLatency, r.latency)
          })

          const elapsed = (Date.now() - startTimeRef.current) / 1000
          setProgress({
            completed,
            total: totalRequests,
            successCount,
            failureCount,
            avgLatency: Math.round(totalLatency / allResults.length),
            minLatency: minLatency === Number.POSITIVE_INFINITY ? 0 : minLatency,
            maxLatency,
            requestsPerSecond: Math.round((completed / elapsed) * 10) / 10,
          })
        },
        {
          workerProfiles: workerProfilePayload,
        },
      )

      onResults(allResults)
    } finally {
      setIsRunning(false)
    }
  }

  const handleStop = () => {
    abortRef.current = true
    setIsRunning(false)
  }

  const progressPercent = progress ? (progress.completed / progress.total) * 100 : 0

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Configuration */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Zap className="h-5 w-5 text-[oklch(0.65_0.2_35)]" />
            Stress Test Configuration
          </CardTitle>
          <CardDescription>Configure high-volume load testing parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Algorithm */}
          <div className="space-y-2">
            <Label className="text-foreground">Routing Algorithm</Label>
            <Select value={algo} onValueChange={(v) => setAlgo(v as Algorithm)}>
              <SelectTrigger className="bg-input border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALGORITHMS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mode */}
          <div className="space-y-2">
            <Label className="text-foreground">Worker Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)} disabled={useWorkerProfiles}>
              <SelectTrigger className="bg-input border-border disabled:opacity-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {useWorkerProfiles && (
              <p className="text-xs text-muted-foreground">
                Worker-specific profiles force percentage failure mode for each request.
              </p>
            )}
          </div>

          {mode === "percentage_fail" && !useWorkerProfiles && (
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-foreground">Failure Percentage</Label>
                <span className="text-sm text-muted-foreground">{percentageFail}%</span>
              </div>
              <Slider value={[percentageFail]} onValueChange={([v]) => setPercentageFail(v)} max={100} step={5} />
            </div>
          )}

          {/* Processing Delay */}
          <div className={`space-y-2 ${useWorkerProfiles ? "opacity-50 pointer-events-none" : ""}`}>
            <div className="flex justify-between">
              <Label className="text-foreground">Processing Delay</Label>
              <span className="text-sm text-muted-foreground">{delayMs}ms</span>
            </div>
            <Slider value={[delayMs]} onValueChange={([v]) => setDelayMs(v)} max={1000} step={50} disabled={useWorkerProfiles} />
            {useWorkerProfiles && (
              <p className="text-xs text-muted-foreground">
                Global delay is disabled while worker profiles are active. Use the per-worker sliders below.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <Label className="text-foreground">Worker Error Profiles</Label>
              <p className="text-sm text-muted-foreground">
                Configure individual failure rates per worker (requests rotate evenly).
              </p>
            </div>
            <Switch checked={useWorkerProfiles} onCheckedChange={setUseWorkerProfiles} />
          </div>

          {useWorkerProfiles && (
            <div className="space-y-4 rounded-lg border border-border bg-secondary/40 p-4">
              {workerProfiles.map((profile, index) => (
                <div key={profile.workerUrl} className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Label className="text-foreground">{formatWorkerLabel(profile.workerUrl)}</Label>
                      <p className="text-xs text-muted-foreground truncate">{profile.workerUrl}</p>
                    </div>
                    <Select value={profile.mode} onValueChange={(value) => updateWorkerProfileMode(index, value as Mode)}>
                      <SelectTrigger className="w-36 bg-input border-border text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODES.map((m) => (
                          <SelectItem key={m.value} value={m.value} className="text-sm">
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {profile.mode === "percentage_fail" && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Failure Percentage</span>
                        <span>{profile.failureRate ?? 0}%</span>
                      </div>
                      <Slider
                        value={[profile.failureRate ?? 0]}
                        onValueChange={([v]) => updateWorkerProfileFailure(index, v)}
                        max={100}
                        step={5}
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Processing Delay</span>
                      <span>{profile.processingDelayMs ?? 0}ms</span>
                    </div>
                    <Slider
                      value={[profile.processingDelayMs ?? 0]}
                      onValueChange={([v]) => updateWorkerProfileDelay(index, v)}
                      max={2000}
                      step={50}
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Requests are proxied directly to each worker with the chosen mode, failure percentage, and processing delay.
              </p>
            </div>
          )}

          {/* Total Requests */}
          <div className="space-y-2">
            <Label className="text-foreground">Total Requests</Label>
            <Input
              type="number"
              min={10}
              max={1000}
              value={totalRequests}
              onChange={(e) => setTotalRequests(Number.parseInt(e.target.value) || 100)}
              className="bg-input border-border"
            />
          </div>

          {/* Concurrency */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-foreground">Concurrency</Label>
              <span className="text-sm text-muted-foreground">{concurrency} parallel requests</span>
            </div>
            <Slider value={[concurrency]} onValueChange={([v]) => setConcurrency(v)} min={1} max={50} step={1} />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {!isRunning ? (
              <Button
                onClick={handleStart}
                className="flex-1 bg-[oklch(0.65_0.2_35)] text-[oklch(0.13_0.005_260)] hover:bg-[oklch(0.65_0.2_35/0.9)]"
              >
                <Zap className="mr-2 h-4 w-4" />
                Start Stress Test
              </Button>
            ) : (
              <Button onClick={handleStop} variant="destructive" className="flex-1">
                <Square className="mr-2 h-4 w-4" />
                Stop Test
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Live Stats */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Activity className="h-5 w-5" />
            Live Statistics
          </CardTitle>
          <CardDescription>Real-time test progress and metrics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {progress ? (
            <>
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="text-foreground font-mono">
                    {progress.completed}/{progress.total}
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-[oklch(0.7_0.18_145/0.1)] p-4">
                  <div className="flex items-center gap-2 text-[oklch(0.7_0.18_145)]">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm">Success</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground mt-1">{progress.successCount}</p>
                </div>
                <div className="rounded-lg bg-destructive/10 p-4">
                  <div className="flex items-center gap-2 text-destructive">
                    <XCircle className="h-4 w-4" />
                    <span className="text-sm">Failed</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground mt-1">{progress.failureCount}</p>
                </div>
              </div>

              {/* Latency Stats */}
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Latency Metrics</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-secondary/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Min</p>
                    <p className="text-lg font-mono text-foreground">{progress.minLatency}ms</p>
                  </div>
                  <div className="rounded-lg bg-secondary/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Avg</p>
                    <p className="text-lg font-mono text-foreground">{progress.avgLatency}ms</p>
                  </div>
                  <div className="rounded-lg bg-secondary/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Max</p>
                    <p className="text-lg font-mono text-foreground">{progress.maxLatency}ms</p>
                  </div>
                </div>
              </div>

              {/* Throughput */}
              <div className="rounded-lg bg-primary/10 p-4">
                <div className="flex items-center gap-2 text-primary">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm">Throughput</span>
                </div>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {progress.requestsPerSecond} <span className="text-sm font-normal text-muted-foreground">req/s</span>
                </p>
              </div>

              {/* Success Rate */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Success Rate</span>
                  <span className="text-foreground font-mono">
                    {progress.completed > 0 ? Math.round((progress.successCount / progress.completed) * 100) : 0}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-[oklch(0.7_0.18_145)] transition-all"
                    style={{
                      width: `${progress.completed > 0 ? (progress.successCount / progress.completed) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-12 w-12 mb-4 opacity-20" />
              <p>No stress test running</p>
              <p className="text-sm">Configure parameters and start a test</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
