"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { TestResult } from "@/lib/types"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts"
import { Activity, CheckCircle2, Clock, TrendingUp } from "lucide-react"

interface MetricsOverviewProps {
  results: TestResult[]
}

const COLORS = {
  success: "oklch(0.7 0.18 145)",
  failure: "oklch(0.55 0.22 25)",
  primary: "oklch(0.7 0.15 180)",
  accent: "oklch(0.65 0.2 35)",
  muted: "oklch(0.4 0 0)",
}

export function MetricsOverview({ results }: MetricsOverviewProps) {
  const metrics = useMemo(() => {
    if (results.length === 0) return null

    const successCount = results.filter((r) => r.success).length
    const failureCount = results.length - successCount
    const latencies = results.map((r) => r.latency)
    const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    const minLatency = Math.min(...latencies)
    const maxLatency = Math.max(...latencies)
    const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)]

    // Algorithm distribution
    const algoDistribution: Record<string, number> = {}
    results.forEach((r) => {
      const algo = r.algoUsed || "unknown"
      algoDistribution[algo] = (algoDistribution[algo] || 0) + 1
    })

    // Worker distribution
    const workerDistribution: Record<string, { total: number; success: number }> = {}
    results.forEach((r) => {
      const worker = r.workerUrl || "unknown"
      if (!workerDistribution[worker]) {
        workerDistribution[worker] = { total: 0, success: 0 }
      }
      workerDistribution[worker].total++
      if (r.success) workerDistribution[worker].success++
    })

    // Latency over time (last 50 requests)
    const latencyOverTime = results
      .slice(0, 50)
      .reverse()
      .map((r, i) => ({
        index: i,
        latency: r.latency,
        success: r.success,
      }))

    // Status code distribution
    const statusCodes: Record<number, number> = {}
    results.forEach((r) => {
      statusCodes[r.status] = (statusCodes[r.status] || 0) + 1
    })

    return {
      total: results.length,
      successCount,
      failureCount,
      successRate: Math.round((successCount / results.length) * 100),
      avgLatency,
      minLatency,
      maxLatency,
      p95Latency,
      algoDistribution,
      workerDistribution,
      latencyOverTime,
      statusCodes,
    }
  }, [results])

  if (!metrics) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Activity className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg">No test data available</p>
          <p className="text-sm">Run some tests to see metrics</p>
        </CardContent>
      </Card>
    )
  }

  const pieData = [
    { name: "Success", value: metrics.successCount, color: COLORS.success },
    { name: "Failure", value: metrics.failureCount, color: COLORS.failure },
  ]

  const algoData = Object.entries(metrics.algoDistribution).map(([name, value]) => ({
    name,
    value,
  }))

  const workerData = Object.entries(metrics.workerDistribution).map(([url, data]) => ({
    name: url.replace("https://", "").replace(".workers.dev", "").replace("/", ""),
    total: data.total,
    success: data.success,
    failure: data.total - data.success,
    successRate: Math.round((data.success / data.total) * 100),
  }))

  const statusData = Object.entries(metrics.statusCodes).map(([code, count]) => ({
    code,
    count,
  }))

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Requests</p>
                <p className="text-3xl font-bold text-foreground">{metrics.total}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Activity className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-3xl font-bold text-foreground">{metrics.successRate}%</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-[oklch(0.7_0.18_145/0.1)] flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-[oklch(0.7_0.18_145)]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Latency</p>
                <p className="text-3xl font-bold text-foreground">{metrics.avgLatency}ms</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-[oklch(0.65_0.2_35/0.1)] flex items-center justify-center">
                <Clock className="h-6 w-6 text-[oklch(0.65_0.2_35)]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">P95 Latency</p>
                <p className="text-3xl font-bold text-foreground">{metrics.p95Latency}ms</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Success/Failure Pie Chart */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Success vs Failure</CardTitle>
            <CardDescription>Overall request outcome distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.16 0.005 260)",
                      border: "1px solid oklch(0.28 0.01 260)",
                      borderRadius: "8px",
                      color: "oklch(0.95 0 0)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ background: COLORS.success }} />
                <span className="text-sm text-muted-foreground">Success ({metrics.successCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ background: COLORS.failure }} />
                <span className="text-sm text-muted-foreground">Failure ({metrics.failureCount})</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Latency Over Time */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Latency Over Time</CardTitle>
            <CardDescription>Last 50 requests response time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.latencyOverTime}>
                  <defs>
                    <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="index" stroke="oklch(0.4 0 0)" fontSize={12} />
                  <YAxis stroke="oklch(0.4 0 0)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.16 0.005 260)",
                      border: "1px solid oklch(0.28 0.01 260)",
                      borderRadius: "8px",
                      color: "oklch(0.95 0 0)",
                    }}
                    formatter={(value: number) => [`${value}ms`, "Latency"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="latency"
                    stroke={COLORS.primary}
                    fill="url(#latencyGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Worker Distribution */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Worker Distribution</CardTitle>
            <CardDescription>Requests per worker with success rate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workerData} layout="vertical">
                  <XAxis type="number" stroke="oklch(0.4 0 0)" fontSize={12} />
                  <YAxis dataKey="name" type="category" stroke="oklch(0.4 0 0)" fontSize={10} width={80} />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.16 0.005 260)",
                      border: "1px solid oklch(0.28 0.01 260)",
                      borderRadius: "8px",
                      color: "oklch(0.95 0 0)",
                    }}
                  />
                  <Bar dataKey="success" stackId="a" fill={COLORS.success} />
                  <Bar dataKey="failure" stackId="a" fill={COLORS.failure} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Algorithm Distribution */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Algorithm Usage</CardTitle>
            <CardDescription>Distribution of routing algorithms used</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={algoData}>
                  <XAxis dataKey="name" stroke="oklch(0.4 0 0)" fontSize={12} />
                  <YAxis stroke="oklch(0.4 0 0)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.16 0.005 260)",
                      border: "1px solid oklch(0.28 0.01 260)",
                      borderRadius: "8px",
                      color: "oklch(0.95 0 0)",
                    }}
                  />
                  <Bar dataKey="value" fill={COLORS.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Codes */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Status Code Distribution</CardTitle>
          <CardDescription>HTTP response codes from all requests</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {statusData.map(({ code, count }) => (
              <div
                key={code}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  code.startsWith("2")
                    ? "bg-[oklch(0.7_0.18_145/0.1)]"
                    : code.startsWith("4")
                      ? "bg-[oklch(0.65_0.2_35/0.1)]"
                      : code.startsWith("5")
                        ? "bg-destructive/10"
                        : "bg-secondary"
                }`}
              >
                <Badge
                  variant="outline"
                  className={
                    code.startsWith("2")
                      ? "border-[oklch(0.7_0.18_145)] text-[oklch(0.7_0.18_145)]"
                      : code.startsWith("4")
                        ? "border-[oklch(0.65_0.2_35)] text-[oklch(0.65_0.2_35)]"
                        : code.startsWith("5")
                          ? "border-destructive text-destructive"
                          : ""
                  }
                >
                  {code}
                </Badge>
                <span className="text-foreground font-mono">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Latency Stats */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Latency Statistics</CardTitle>
          <CardDescription>Detailed response time analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg bg-secondary/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">Minimum</p>
              <p className="text-2xl font-mono font-bold text-foreground">{metrics.minLatency}ms</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">Average</p>
              <p className="text-2xl font-mono font-bold text-foreground">{metrics.avgLatency}ms</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">P95</p>
              <p className="text-2xl font-mono font-bold text-foreground">{metrics.p95Latency}ms</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">Maximum</p>
              <p className="text-2xl font-mono font-bold text-foreground">{metrics.maxLatency}ms</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
