"use client"

import { useState, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { TestResult } from "@/lib/types"
import { Trash2, Search, Eye, Download, CheckCircle2, XCircle, Clock } from "lucide-react"

interface TestHistoryProps {
  results: TestResult[]
  onClear: () => void
}

export function TestHistory({ results, onClear }: TestHistoryProps) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failure">("all")
  const [algoFilter, setAlgoFilter] = useState<string>("all")
  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      // Status filter
      if (statusFilter === "success" && !r.success) return false
      if (statusFilter === "failure" && r.success) return false

      // Algorithm filter
      if (algoFilter !== "all" && r.algoUsed !== algoFilter) return false

      // Search filter
      if (search) {
        const searchLower = search.toLowerCase()
        if (
          !r.workerUrl?.toLowerCase().includes(searchLower) &&
          !r.algoUsed?.toLowerCase().includes(searchLower) &&
          !r.responseBody.toLowerCase().includes(searchLower) &&
          !r.status.toString().includes(searchLower)
        ) {
          return false
        }
      }

      return true
    })
  }, [results, search, statusFilter, algoFilter])

  const uniqueAlgos = useMemo(() => {
    const algos = new Set<string>()
    results.forEach((r) => {
      if (r.algoUsed) algos.add(r.algoUsed)
    })
    return Array.from(algos)
  }, [results])

  const exportResults = () => {
    const data = JSON.stringify(filteredResults, null, 2)
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `magnetar-test-results-${new Date().toISOString()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Test History</h2>
          <p className="text-sm text-muted-foreground">
            {filteredResults.length} of {results.length} results
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportResults}
            disabled={filteredResults.length === 0}
            className="border-border bg-transparent"
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="destructive" size="sm" onClick={onClear} disabled={results.length === 0}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear All
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by worker URL, algorithm, response..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-input border-border"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-32 bg-input border-border">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failure">Failure</SelectItem>
                </SelectContent>
              </Select>
              <Select value={algoFilter} onValueChange={setAlgoFilter}>
                <SelectTrigger className="w-36 bg-input border-border">
                  <SelectValue placeholder="Algorithm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Algorithms</SelectItem>
                  {uniqueAlgos.map((algo) => (
                    <SelectItem key={algo} value={algo}>
                      {algo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Timestamp</TableHead>
                  <TableHead className="text-muted-foreground">Algorithm</TableHead>
                  <TableHead className="text-muted-foreground">Worker</TableHead>
                  <TableHead className="text-muted-foreground">Latency</TableHead>
                  <TableHead className="text-muted-foreground">Response</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResults.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      No results found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredResults.slice(0, 100).map((result) => (
                    <TableRow key={result.id} className="border-border">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {result.success ? (
                            <CheckCircle2 className="h-4 w-4 text-[oklch(0.7_0.18_145)]" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          <Badge
                            variant="outline"
                            className={
                              result.success
                                ? "border-[oklch(0.7_0.18_145)] text-[oklch(0.7_0.18_145)]"
                                : "border-destructive text-destructive"
                            }
                          >
                            {result.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {new Date(result.timestamp).toLocaleTimeString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{result.algoUsed || "N/A"}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground max-w-[200px] truncate">
                        {result.workerUrl?.replace("https://", "").replace(".workers.dev", "") || "N/A"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span className="font-mono text-foreground">{result.latency}ms</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground max-w-[100px] truncate">
                        {result.responseBody || "(empty)"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl bg-card border-border">
                            <DialogHeader>
                              <DialogTitle className="text-foreground">Request Details</DialogTitle>
                              <DialogDescription>Full details for request {result.id.slice(0, 8)}...</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 max-h-96 overflow-y-auto">
                              {/* Status */}
                              <div className="flex items-center gap-2">
                                {result.success ? (
                                  <CheckCircle2 className="h-5 w-5 text-[oklch(0.7_0.18_145)]" />
                                ) : (
                                  <XCircle className="h-5 w-5 text-destructive" />
                                )}
                                <span className="font-medium text-foreground">
                                  {result.status} {result.statusText}
                                </span>
                                <span className="text-muted-foreground">• {result.latency}ms</span>
                              </div>

                              {/* Config */}
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium text-muted-foreground">Request Config</h4>
                                <pre className="rounded-lg bg-secondary/50 p-3 text-xs font-mono overflow-x-auto text-foreground">
                                  {JSON.stringify(result.config, null, 2)}
                                </pre>
                              </div>

                              {/* Router Headers */}
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium text-muted-foreground">Router Headers</h4>
                                <div className="rounded-lg bg-secondary/50 p-3 space-y-1">
                                  <div className="flex gap-2 text-sm">
                                    <span className="text-primary font-mono">x-magnetar-worker-url:</span>
                                    <span className="font-mono text-foreground">{result.workerUrl || "N/A"}</span>
                                  </div>
                                  <div className="flex gap-2 text-sm">
                                    <span className="text-primary font-mono">x-algo-used:</span>
                                    <span className="font-mono text-foreground">{result.algoUsed || "N/A"}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Response Body */}
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium text-muted-foreground">Response Body</h4>
                                <pre className="rounded-lg bg-secondary/50 p-3 text-xs font-mono text-foreground">
                                  {result.responseBody || "(empty)"}
                                </pre>
                              </div>

                              {/* All Headers */}
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium text-muted-foreground">All Response Headers</h4>
                                <pre className="rounded-lg bg-secondary/50 p-3 text-xs font-mono overflow-x-auto text-foreground">
                                  {JSON.stringify(result.headers, null, 2)}
                                </pre>
                              </div>

                              {/* Error */}
                              {result.error && (
                                <div className="space-y-2">
                                  <h4 className="text-sm font-medium text-destructive">Error</h4>
                                  <pre className="rounded-lg bg-destructive/10 p-3 text-xs font-mono text-destructive">
                                    {result.error}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filteredResults.length > 100 && (
            <div className="p-4 text-center text-sm text-muted-foreground border-t border-border">
              Showing 100 of {filteredResults.length} results
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
