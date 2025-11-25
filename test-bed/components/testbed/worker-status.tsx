"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { AVAILABLE_WORKERS } from "@/lib/magnetar-client"
import type { TestResult } from "@/lib/types"
import { Server, RefreshCw, CheckCircle2, XCircle, Clock, Activity } from "lucide-react"

interface WorkerStatusProps {
  results: TestResult[]
}

interface WorkerHealth {
  url: string
  status: "online" | "offline" | "unknown"
  latency: number | null
  lastChecked: number | null
}

export function WorkerStatus({ results }: WorkerStatusProps) {
  const [workers, setWorkers] = useState<WorkerHealth[]>(
    AVAILABLE_WORKERS.map((url) => ({
      url,
      status: "unknown",
      latency: null,
      lastChecked: null,
    })),
  )
  const [isChecking, setIsChecking] = useState(false)

  const checkWorkerHealth = async (url: string): Promise<WorkerHealth> => {
    try {
      const response = await fetch("/api/worker-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })

      const payload = (await response.json()) as {
        ok?: boolean
        latency?: number
        error?: string
        status?: number
      }

      const isHealthy = response.ok && payload.ok

      return {
        url,
        status: isHealthy ? "online" : "offline",
        latency: typeof payload.latency === "number" ? payload.latency : null,
        lastChecked: Date.now(),
      }
    } catch (error) {
      console.error("Failed to check worker health", { url, error })
      return {
        url,
        status: "offline",
        latency: null,
        lastChecked: Date.now(),
      }
    }
  }

  const checkAllWorkers = async () => {
    setIsChecking(true)
    const results = await Promise.all(AVAILABLE_WORKERS.map(checkWorkerHealth))
    setWorkers(results)
    setIsChecking(false)
  }

  const workerStats = useMemo(() => {
    const stats: Record<string, { total: number; success: number; avgLatency: number; latencies: number[] }> = {}

    AVAILABLE_WORKERS.forEach((url) => {
      stats[url] = { total: 0, success: 0, avgLatency: 0, latencies: [] }
    })

    results.forEach((r) => {
      if (r.workerUrl && stats[r.workerUrl]) {
        stats[r.workerUrl].total++
        if (r.success) stats[r.workerUrl].success++
        stats[r.workerUrl].latencies.push(r.latency)
      }
    })

    Object.keys(stats).forEach((url) => {
      if (stats[url].latencies.length > 0) {
        stats[url].avgLatency = Math.round(
          stats[url].latencies.reduce((a, b) => a + b, 0) / stats[url].latencies.length,
        )
      }
    })

    return stats
  }, [results])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Worker Fleet Status</h2>
          <p className="text-sm text-muted-foreground">Monitor health and performance of all workers</p>
        </div>
        <Button
          onClick={checkAllWorkers}
          disabled={isChecking}
          variant="outline"
          className="border-border bg-transparent"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isChecking ? "animate-spin" : ""}`} />
          {isChecking ? "Checking..." : "Check All"}
        </Button>
      </div>

      {/* Worker Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {workers.map((worker, index) => {
          const stats = workerStats[worker.url] || { total: 0, success: 0, avgLatency: 0 }
          const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0
          const shortUrl = worker.url.replace("https://", "").replace(".workers.dev", "").replace("/", "")

          return (
            <Card key={worker.url} className="bg-card border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base text-foreground">Worker {index + 1}</CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      worker.status === "online"
                        ? "border-[oklch(0.7_0.18_145)] text-[oklch(0.7_0.18_145)]"
                        : worker.status === "offline"
                          ? "border-destructive text-destructive"
                          : "border-muted-foreground text-muted-foreground"
                    }
                  >
                    {worker.status === "online" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                    {worker.status === "offline" && <XCircle className="mr-1 h-3 w-3" />}
                    {worker.status}
                  </Badge>
                </div>
                <CardDescription className="font-mono text-xs">{shortUrl}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Health Check Latency */}
                {worker.latency !== null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Health Check
                    </span>
                    <span className="font-mono text-foreground">{worker.latency}ms</span>
                  </div>
                )}

                {/* Stats from Results */}
                {stats.total > 0 && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        Total Requests
                      </span>
                      <span className="font-mono text-foreground">{stats.total}</span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Success Rate</span>
                        <span className="font-mono text-foreground">{successRate}%</span>
                      </div>
                      <Progress value={successRate} className="h-2" />
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Avg Latency</span>
                      <span className="font-mono text-foreground">{stats.avgLatency}ms</span>
                    </div>
                  </>
                )}

                {stats.total === 0 && worker.status === "unknown" && (
                  <div className="text-center py-4 text-muted-foreground text-sm">No data yet</div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Fleet Summary */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Fleet Summary</CardTitle>
          <CardDescription>Aggregated statistics from test results</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg bg-secondary/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">Total Workers</p>
              <p className="text-2xl font-bold text-foreground">{AVAILABLE_WORKERS.length}</p>
            </div>
            <div className="rounded-lg bg-[oklch(0.7_0.18_145/0.1)] p-4 text-center">
              <p className="text-sm text-muted-foreground">Online</p>
              <p className="text-2xl font-bold text-[oklch(0.7_0.18_145)]">
                {workers.filter((w) => w.status === "online").length}
              </p>
            </div>
            <div className="rounded-lg bg-destructive/10 p-4 text-center">
              <p className="text-sm text-muted-foreground">Offline</p>
              <p className="text-2xl font-bold text-destructive">
                {workers.filter((w) => w.status === "offline").length}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">Unknown</p>
              <p className="text-2xl font-bold text-muted-foreground">
                {workers.filter((w) => w.status === "unknown").length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
