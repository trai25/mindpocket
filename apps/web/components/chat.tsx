"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input"
import { ChatInput } from "@/components/chat-input"
import { ChatMessages } from "@/components/chat-messages"
import { useT } from "@/lib/i18n"
import { useChatStore } from "@/stores"

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) {
    return "早上好"
  }
  if (hour >= 12 && hour < 18) {
    return "下午好"
  }
  if (hour >= 18 && hour < 23) {
    return "晚上好"
  }
  return "夜深了"
}

export function Chat({
  id,
  initialMessages = [],
  autoResume = false,
}: {
  id: string
  initialMessages?: UIMessage[]
  autoResume?: boolean
}) {
  const t = useT()
  const [input, setInput] = useState("")
  const {
    selectedModelId,
    useKnowledgeBase,
    useFolderTools,
    setSelectedModelId,
    setUseKnowledgeBase,
    setUseFolderTools,
  } = useChatStore()
  const hasReplacedUrl = useRef(false)
  const greeting = useMemo(() => getGreeting(), [])
  const selectedModelIdRef = useRef(selectedModelId)
  selectedModelIdRef.current = selectedModelId
  const useKnowledgeBaseRef = useRef(useKnowledgeBase)
  useKnowledgeBaseRef.current = useKnowledgeBase
  const useFolderToolsRef = useRef(useFolderTools)
  useFolderToolsRef.current = useFolderTools

  // Fetch user's default chat model on mount (only if not already set)
  useEffect(() => {
    if (selectedModelId) {
      return // Already have a model selected from persisted state
    }
    fetch("/api/ai-providers")
      .then((res) => res.json())
      .then((providers: Array<{ id: string; type: string; isDefault: boolean }>) => {
        const defaultChat = providers.find((p) => p.type === "chat" && p.isDefault)
        const firstChat = providers.find((p) => p.type === "chat")
        const model = defaultChat || firstChat
        if (model) {
          setSelectedModelId(model.id)
        }
      })
      .catch(() => {
        // ignore fetch errors
      })
  }, [selectedModelId, setSelectedModelId])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          selectedChatModel: selectedModelIdRef.current,
          useKnowledgeBase: useKnowledgeBaseRef.current,
          useFolderTools: useFolderToolsRef.current,
        }),
      }),
    []
  )

  const { messages, status, sendMessage, stop, resumeStream } = useChat({
    id,
    messages: initialMessages,
    transport,
    experimental_throttle: 50,
    onError: (error) => {
      if (error.message?.includes("no_chat_model")) {
        toast.error(t.settings.aiModelNoChatModel)
        return
      }
      toast.error("发送失败", {
        description: error.message || "请稍后重试",
      })
    },
  })

  // 自动恢复流
  const hasResumed = useRef(false)
  if (autoResume && !hasResumed.current) {
    hasResumed.current = true
    const lastMessage = initialMessages.at(-1)
    if (lastMessage?.role === "user") {
      resumeStream()
    }
  }

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (!message.text?.trim() && message.files.length === 0) {
        return
      }

      sendMessage({
        text: message.text,
        files: message.files,
      })
      setInput("")

      if (!hasReplacedUrl.current && initialMessages.length === 0) {
        window.history.replaceState({}, "", `/chat/${id}`)
        hasReplacedUrl.current = true
      }
    },
    [sendMessage, id, initialMessages.length]
  )

  const isEmpty = messages.length === 0

  return (
    <div className="flex h-full flex-col px-6">
      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-start pt-40">
          <div className="animate-in fade-in slide-in-from-bottom-4 w-full max-w-2xl duration-500">
            <div className="mb-6 text-center">
              <h1 className="bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text font-bold text-3xl text-transparent">
                {greeting}
              </h1>
              <p className="mt-2 text-muted-foreground">有什么可以帮您的吗？</p>
            </div>
            <ChatInput
              input={input}
              onKnowledgeBaseChange={setUseKnowledgeBase}
              onModelChange={setSelectedModelId}
              onSubmit={handleSubmit}
              onFolderToolsChange={setUseFolderTools}
              selectedModelId={selectedModelId}
              setInput={setInput}
              status={status}
              stop={stop}
              useFolderTools={useFolderTools}
              useKnowledgeBase={useKnowledgeBase}
            />
          </div>
        </div>
      ) : (
        <>
          <ChatMessages messages={messages} status={status} />
          <ChatInput
            input={input}
            onKnowledgeBaseChange={setUseKnowledgeBase}
            onModelChange={setSelectedModelId}
            onSubmit={handleSubmit}
            onFolderToolsChange={setUseFolderTools}
            selectedModelId={selectedModelId}
            setInput={setInput}
            status={status}
            stop={stop}
            useFolderTools={useFolderTools}
            useKnowledgeBase={useKnowledgeBase}
          />
        </>
      )}
    </div>
  )
}
