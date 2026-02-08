"use client"

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileUp,
  Globe,
  List,
  Loader2,
  Upload,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/lib/i18n"

interface HistoryItem {
  id: string
  title: string
  type: string
  sourceType: string | null
  ingestStatus: string
  ingestError: string | null
  url: string | null
  createdAt: string
}

type StatusFilter = "all" | "pending" | "processing" | "completed" | "failed"
const MAX_URL_PREVIEW_LENGTH = 90

function getSourceLabel(item: HistoryItem, t: ReturnType<typeof useT>) {
  if (item.sourceType === "file") {
    return t.ingest.sourceFile
  }

  if (item.sourceType === "extension") {
    return t.ingest.sourceExtension
  }

  if (item.url) {
    try {
      const { hostname } = new URL(item.url)
      return hostname.replace(/^www\./, "") || t.ingest.sourceUrl
    } catch {
      return t.ingest.sourceUrl
    }
  }

  return t.ingest.sourceUnknown
}

export default function IngestPage() {
  const t = useT()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchHistory = useCallback(async (filter: StatusFilter) => {
    try {
      const params = new URLSearchParams({ limit: "50" })
      if (filter !== "all") {
        params.set("status", filter)
      }
      const res = await fetch(`/api/ingest/history?${params}`)
      if (res.ok) {
        const data = await res.json()
        setHistory(data.items)
      }
    } catch {
      // silently fail
    } finally {
      setIsLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory(statusFilter)
  }, [fetchHistory, statusFilter])

  // 轮询：当有 pending/processing 状态时每 3 秒刷新
  useEffect(() => {
    const hasPending = history.some(
      (item) => item.ingestStatus === "pending" || item.ingestStatus === "processing"
    )

    if (hasPending) {
      pollingRef.current = setInterval(() => {
        fetchHistory(statusFilter)
      }, 3000)
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [history, fetchHistory, statusFilter])

  const handleIngestSuccess = useCallback(() => {
    fetchHistory(statusFilter)
  }, [fetchHistory, statusFilter])

  return (
    <SidebarInset className="min-w-0">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 bg-background">
        <div className="flex flex-1 items-center gap-2 px-3">
          <SidebarTrigger />
          <Separator className="mr-2 data-[orientation=vertical]:h-4" orientation="vertical" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage className="line-clamp-1">{t.ingest.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex min-w-0 flex-1 flex-col gap-6 p-4">
        <IngestForm onSuccess={handleIngestSuccess} t={t} />
        <Separator />
        <IngestHistory
          history={history}
          isLoading={isLoadingHistory}
          onFilterChange={setStatusFilter}
          statusFilter={statusFilter}
          t={t}
        />
      </div>
    </SidebarInset>
  )
}

function IngestForm({ onSuccess, t }: { onSuccess: () => void; t: ReturnType<typeof useT> }) {
  return (
    <div>
      <Tabs defaultValue="url">
        <TabsList>
          <TabsTrigger value="url">
            <Globe className="size-4" />
            {t.ingest.tabUrl}
          </TabsTrigger>
          <TabsTrigger value="file">
            <FileUp className="size-4" />
            {t.ingest.tabFile}
          </TabsTrigger>
          <TabsTrigger value="batch">
            <List className="size-4" />
            {t.ingest.tabBatch}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="url">
          <UrlIngestForm onSuccess={onSuccess} t={t} />
        </TabsContent>
        <TabsContent value="file">
          <FileIngestForm onSuccess={onSuccess} t={t} />
        </TabsContent>
        <TabsContent value="batch">
          <BatchIngestForm onSuccess={onSuccess} t={t} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function UrlIngestForm({ onSuccess, t }: { onSuccess: () => void; t: ReturnType<typeof useT> }) {
  const [url, setUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) {
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      })
      if (res.ok) {
        toast.success(t.ingest.submitSuccess)
        setUrl("")
        onSuccess()
      } else {
        toast.error(t.ingest.submitFailed)
      }
    } catch {
      toast.error(t.ingest.submitFailed)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="mt-4 flex gap-2" onSubmit={handleSubmit}>
      <Input
        className="flex-1"
        disabled={submitting}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={t.ingest.urlPlaceholder}
        type="url"
        value={url}
      />
      <Button disabled={submitting || !url.trim()} type="submit">
        {submitting ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {submitting ? t.ingest.submitting : t.ingest.urlSubmit}
      </Button>
    </form>
  )
}

function FileIngestForm({ onSuccess, t }: { onSuccess: () => void; t: ReturnType<typeof useT> }) {
  const [submitting, setSubmitting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      })
      if (res.ok) {
        toast.success(t.ingest.submitSuccess)
        onSuccess()
      } else {
        toast.error(t.ingest.submitFailed)
      }
    } catch {
      toast.error(t.ingest.submitFailed)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
      }`}
      onClick={() => inputRef.current?.click()}
      onDragLeave={() => setDragOver(false)}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) {
          handleFile(file)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          inputRef.current?.click()
        }
      }}
      role="button"
      tabIndex={0}
    >
      <input
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            handleFile(file)
          }
        }}
        ref={inputRef}
        type="file"
      />
      {submitting ? (
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      ) : (
        <FileUp className="size-8 text-muted-foreground" />
      )}
      <p className="mt-2 font-medium text-sm">{t.ingest.fileDragHint}</p>
      <p className="mt-1 text-muted-foreground text-xs">{t.ingest.fileSupported}</p>
    </div>
  )
}

function BatchIngestForm({ onSuccess, t }: { onSuccess: () => void; t: ReturnType<typeof useT> }) {
  const [text, setText] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const urls = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    if (urls.length === 0) {
      return
    }

    setSubmitting(true)
    try {
      const results = await Promise.allSettled(
        urls.map((url) =>
          fetch("/api/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          })
        )
      )
      const successCount = results.filter((r) => r.status === "fulfilled" && r.value.ok).length
      toast.success(`${t.ingest.batchSuccess} (${successCount}/${urls.length})`)
      setText("")
      onSuccess()
    } catch {
      toast.error(t.ingest.submitFailed)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit}>
      <Textarea
        className="min-h-[120px]"
        disabled={submitting}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.ingest.batchPlaceholder}
        value={text}
      />
      <Button className="self-end" disabled={submitting || !text.trim()} type="submit">
        {submitting ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {submitting ? t.ingest.submitting : t.ingest.batchSubmit}
      </Button>
    </form>
  )
}

const STATUS_FILTERS: StatusFilter[] = ["all", "pending", "processing", "completed", "failed"]

function IngestHistory({
  history,
  isLoading,
  statusFilter,
  onFilterChange,
  t,
}: {
  history: HistoryItem[]
  isLoading: boolean
  statusFilter: StatusFilter
  onFilterChange: (f: StatusFilter) => void
  t: ReturnType<typeof useT>
}) {
  const filterLabels: Record<StatusFilter, string> = {
    all: t.ingest.filterAll,
    pending: t.ingest.filterPending,
    processing: t.ingest.filterProcessing,
    completed: t.ingest.filterCompleted,
    failed: t.ingest.filterFailed,
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-lg">{t.ingest.history}</h2>
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f}
              onClick={() => onFilterChange(f)}
              size="sm"
              variant={statusFilter === f ? "default" : "ghost"}
            >
              {filterLabels[f]}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {!isLoading && history.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">{t.ingest.emptyHistory}</p>
      )}
      {!isLoading && history.length > 0 && (
        <div className="flex flex-col gap-2">
          {history.map((item) => (
            <HistoryRow item={item} key={item.id} t={t} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status, t }: { status: string; t: ReturnType<typeof useT> }) {
  switch (status) {
    case "pending":
      return (
        <Badge className="gap-1" variant="secondary">
          <Clock className="size-3" />
          {t.ingest.statusPending}
        </Badge>
      )
    case "processing":
      return (
        <Badge className="gap-1" variant="secondary">
          <Loader2 className="size-3 animate-spin" />
          {t.ingest.statusProcessing}
        </Badge>
      )
    case "completed":
      return (
        <Badge className="gap-1" variant="default">
          <CheckCircle2 className="size-3" />
          {t.ingest.statusCompleted}
        </Badge>
      )
    case "failed":
      return (
        <Badge className="gap-1" variant="destructive">
          <AlertCircle className="size-3" />
          {t.ingest.statusFailed}
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function HistoryRow({ item, t }: { item: HistoryItem; t: ReturnType<typeof useT> }) {
  const urlPreview =
    item.url && item.url.length > MAX_URL_PREVIEW_LENGTH
      ? `${item.url.slice(0, MAX_URL_PREVIEW_LENGTH)}...`
      : item.url
  const sourceLabel = getSourceLabel(item, t)

  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-lg border p-3">
      <div className="min-w-0 flex-1 overflow-hidden">
        {item.ingestStatus === "completed" ? (
          <Link className="block truncate font-medium text-sm hover:underline" href={`/bookmark/${item.id}`}>
            {item.title}
          </Link>
        ) : (
          <p className="truncate font-medium text-sm">{item.title}</p>
        )}
        {urlPreview && (
          <p className="truncate text-muted-foreground text-xs">
            {urlPreview}
          </p>
        )}
        {item.ingestError && (
          <p className="mt-1 line-clamp-2 break-all text-destructive text-xs">{item.ingestError}</p>
        )}
      </div>
      <div className="grid shrink-0 grid-cols-[96px_96px_160px] items-center gap-3">
        <div className="flex justify-end">
          <Badge className="max-w-[96px] truncate text-[10px]" variant="outline">
            {sourceLabel}
          </Badge>
        </div>
        <div className="flex justify-end">
          <div className="max-w-[96px]">
            <StatusBadge status={item.ingestStatus} t={t} />
          </div>
        </div>
        <span className="w-[160px] text-muted-foreground text-right text-xs">
          {new Date(item.createdAt).toLocaleString()}
        </span>
      </div>
    </div>
  )
}
