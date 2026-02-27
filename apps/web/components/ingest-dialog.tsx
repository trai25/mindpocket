"use client"

import { CheckCircle2, FileUp, Globe, Loader2, Upload, XCircle } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const ACCEPT_TYPES = [
  ".pdf",
  ".docx",
  ".doc",
  ".xlsx",
  ".xls",
  ".csv",
  ".html",
  ".htm",
  ".xml",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".mp3",
  ".wav",
  ".ipynb",
  ".zip",
].join(",")

interface IngestDialogProps {
  folders?: Array<{ id: string; name: string; description?: string | null; emoji: string }>
  onSuccess?: () => void
  trigger?: React.ReactNode
}

type IngestState = "idle" | "processing" | "success" | "error"

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function IngestDialog({ folders = [], onSuccess, trigger }: IngestDialogProps) {
  const dialogContentId = "ingest-dialog-content"
  const dialogTitleId = "ingest-dialog-title"
  const dialogDescriptionId = "ingest-dialog-description"
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<IngestState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [folderId, setFolderId] = useState<string>("")
  const [title, setTitle] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setState("idle")
    setError(null)
    setUrl("")
    setSelectedFile(null)
    setTitle("")
  }, [])

  const handleUrlSubmit = useCallback(async () => {
    if (!url.trim()) {
      return
    }
    setState("processing")
    setError(null)

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          folderId: folderId || undefined,
          title: title.trim() || undefined,
          clientSource: "web",
        }),
      })
      const data = await res.json()

      if (!res.ok || data.status === "failed") {
        setState("error")
        setError(data.error || "导入失败")
        toast.error(data.error || "导入失败")
        return
      }

      setState("success")
      toast.success(`已导入: ${data.title}`)
      onSuccess?.()
      setTimeout(() => {
        setOpen(false)
        reset()
      }, 1500)
    } catch {
      setState("error")
      setError("网络错误")
      toast.error("网络错误")
    }
  }, [url, folderId, title, onSuccess, reset])

  const handleFileSubmit = useCallback(async () => {
    if (!selectedFile) {
      return
    }
    setState("processing")
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", selectedFile)
      formData.append("clientSource", "web")
      if (folderId) {
        formData.append("folderId", folderId)
      }
      if (title.trim()) {
        formData.append("title", title.trim())
      }

      const res = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()

      if (!res.ok || data.status === "failed") {
        setState("error")
        setError(data.error || "导入失败")
        toast.error(data.error || "导入失败")
        return
      }

      setState("success")
      toast.success(`已导入: ${data.title}`)
      onSuccess?.()
      setTimeout(() => {
        setOpen(false)
        reset()
      }, 1500)
    } catch {
      setState("error")
      setError("网络错误")
      toast.error("网络错误")
    }
  }, [selectedFile, folderId, title, onSuccess, reset])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      setSelectedFile(file)
    }
  }, [])

  const isProcessing = state === "processing"

  return (
    <Dialog
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) {
          reset()
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline">
            <Upload className="mr-2 size-4" />
            导入
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        aria-describedby={dialogDescriptionId}
        aria-labelledby={dialogTitleId}
        className="sm:max-w-[480px]"
        id={dialogContentId}
      >
        <DialogHeader>
          <DialogTitle id={dialogTitleId}>导入内容</DialogTitle>
          <DialogDescription id={dialogDescriptionId}>
            粘贴链接或上传文件，自动转换为 Markdown 并存入知识库
          </DialogDescription>
        </DialogHeader>

        <Tabs className="mt-2" defaultValue="url">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger disabled={isProcessing} value="url">
              <Globe className="mr-2 size-4" />
              链接
            </TabsTrigger>
            <TabsTrigger disabled={isProcessing} value="file">
              <FileUp className="mr-2 size-4" />
              文件
            </TabsTrigger>
          </TabsList>

          <TabsContent className="mt-4 space-y-4" value="url">
            <div className="space-y-2">
              <Label htmlFor="url">网页链接</Label>
              <Input
                disabled={isProcessing}
                id="url"
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
                placeholder="https://..."
                value={url}
              />
            </div>

            <FolderSelect
              disabled={isProcessing}
              folderId={folderId}
              folders={folders}
              onFolderChange={setFolderId}
            />

            <div className="space-y-2">
              <Label htmlFor="title-url">标题（可选）</Label>
              <Input
                disabled={isProcessing}
                id="title-url"
                onChange={(e) => setTitle(e.target.value)}
                placeholder="自动提取"
                value={title}
              />
            </div>

            <StatusIndicator error={error} state={state} />

            <Button
              className="w-full"
              disabled={!url.trim() || isProcessing}
              onClick={handleUrlSubmit}
            >
              {isProcessing && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isProcessing ? "正在导入..." : "导入链接"}
            </Button>
          </TabsContent>

          <TabsContent className="mt-4 space-y-4" value="file">
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors",
                selectedFile ? "border-primary/50 bg-primary/5" : "border-muted-foreground/25",
                !isProcessing && "cursor-pointer hover:border-primary/50"
              )}
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onKeyDown={(e) => {
                if (isProcessing) {
                  return
                }
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              role="button"
              tabIndex={isProcessing ? -1 : 0}
            >
              <input
                accept={ACCEPT_TYPES}
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                ref={fileInputRef}
                type="file"
              />
              {selectedFile ? (
                <>
                  <FileUp className="size-8 text-primary" />
                  <p className="font-medium text-sm">{selectedFile.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </>
              ) : (
                <>
                  <Upload className="size-8 text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm">点击或拖拽文件到此处</p>
                  <p className="text-muted-foreground/60 text-xs">
                    支持 PDF、Word、Excel、图片、音频等
                  </p>
                </>
              )}
            </div>

            <FolderSelect
              disabled={isProcessing}
              folderId={folderId}
              folders={folders}
              onFolderChange={setFolderId}
            />

            <div className="space-y-2">
              <Label htmlFor="title-file">标题（可选）</Label>
              <Input
                disabled={isProcessing}
                id="title-file"
                onChange={(e) => setTitle(e.target.value)}
                placeholder="自动提取"
                value={title}
              />
            </div>

            <StatusIndicator error={error} state={state} />

            <Button
              className="w-full"
              disabled={!selectedFile || isProcessing}
              onClick={handleFileSubmit}
            >
              {isProcessing && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isProcessing ? "正在处理..." : "上传并导入"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function FolderSelect({
  folders,
  folderId,
  onFolderChange,
  disabled,
}: {
  folders: Array<{ id: string; name: string; emoji: string }>
  folderId: string
  onFolderChange: (v: string) => void
  disabled: boolean
}) {
  if (folders.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <Label>文件夹（可选）</Label>
      <Select disabled={disabled} onValueChange={onFolderChange} value={folderId}>
        <SelectTrigger>
          <SelectValue placeholder="选择文件夹" />
        </SelectTrigger>
        <SelectContent>
          {folders.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.emoji} {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function StatusIndicator({ state, error }: { state: IngestState; error: string | null }) {
  if (state === "success") {
    return (
      <div className="flex items-center gap-2 text-green-600 text-sm">
        <CheckCircle2 className="size-4" />
        导入成功
      </div>
    )
  }

  if (state === "error" && error) {
    return (
      <div className="flex items-center gap-2 text-destructive text-sm">
        <XCircle className="size-4" />
        {error}
      </div>
    )
  }

  return null
}
