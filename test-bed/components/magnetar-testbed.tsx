"use client"

import { useState, useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TestRunner } from "./testbed/test-runner"
import { StressTest } from "./testbed/stress-test"
import { TestHistory } from "./testbed/test-history"
import { MetricsOverview } from "./testbed/metrics-overview"
import { WorkerStatus } from "./testbed/worker-status"
import { RequestInspector } from "./testbed/request-inspector"
import type { TestResult } from "@/lib/types"
import { Activity, Zap, History, BarChart3, Server, Search } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export function MagnetarTestbed() {
  const [results, setResults] = useState<TestResult[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const addResult = useCallback((result: TestResult) => {
    setResults((prev) => [result, ...prev].slice(0, 1000))
  }, [])

  const addResults = useCallback((newResults: TestResult[]) => {
    setResults((prev) => [...newResults, ...prev].slice(0, 1000))
  }, [])

  const clearResults = useCallback(() => {
    setResults([])
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg flex items-center justify-center overflow-hidden">
                <Image src="/logo.png" alt="Magnetar logo" width={40} height={40} priority />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Magnetar Testbed</h1>
                <p className="text-xs text-muted-foreground">Made by <Link href={"https://thesarvagyakumar.site"}>@chiefsarvagya</Link></p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Endpoint:</span>
                <code className="px-2 py-1 bg-secondary rounded text-xs font-mono text-foreground">
                  magnetar-router.chiefsarvagya.workers.dev
                </code>
              </div>
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                  isRunning
                    ? "bg-[oklch(0.7_0.15_180/0.2)] text-[oklch(0.7_0.15_180)]"
                    : "bg-[oklch(0.7_0.18_145/0.2)] text-[oklch(0.7_0.18_145)]"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${isRunning ? "bg-[oklch(0.7_0.15_180)] animate-pulse" : "bg-[oklch(0.7_0.18_145)]"}`}
                />
                {isRunning ? "Running" : "Ready"}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="stress" className="space-y-6">
          <TabsList className="bg-secondary/50 border border-border">
            <TabsTrigger value="runner" className="gap-2 data-[state=active]:bg-card">
              <Activity className="h-4 w-4" />
              Test Runner
            </TabsTrigger>
            <TabsTrigger value="stress" className="gap-2 data-[state=active]:bg-card">
              <Zap className="h-4 w-4" />
              Stress Test
            </TabsTrigger>
            <TabsTrigger value="inspector" className="gap-2 data-[state=active]:bg-card">
              <Search className="h-4 w-4" />
              Request Inspector
            </TabsTrigger>
            <TabsTrigger value="metrics" className="gap-2 data-[state=active]:bg-card">
              <BarChart3 className="h-4 w-4" />
              Metrics
            </TabsTrigger>
            <TabsTrigger value="workers" className="gap-2 data-[state=active]:bg-card">
              <Server className="h-4 w-4" />
              Workers
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 data-[state=active]:bg-card">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="runner" className="space-y-6">
            <TestRunner onResult={addResult} isRunning={isRunning} setIsRunning={setIsRunning} />
          </TabsContent>

          <TabsContent value="stress" className="space-y-6">
            <StressTest onResults={addResults} isRunning={isRunning} setIsRunning={setIsRunning} />
          </TabsContent>

          <TabsContent value="inspector" className="space-y-6">
            <RequestInspector />
          </TabsContent>

          <TabsContent value="metrics" className="space-y-6">
            <MetricsOverview results={results} />
          </TabsContent>

          <TabsContent value="workers" className="space-y-6">
            <WorkerStatus results={results} />
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <TestHistory results={results} onClear={clearResults} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
