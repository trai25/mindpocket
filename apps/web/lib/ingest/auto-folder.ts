import { stepCountIs, ToolLoopAgent } from "ai"
import { getDefaultProvider } from "@/db/queries/ai-provider"
import { getChatModel } from "@/lib/ai/provider"
import { createCreateFolderTool, createListFoldersTool } from "@/lib/ai/tools/folder-tools"

interface ResolveFolderForIngestParams {
  userId: string
  sourceType: "url" | "file" | "extension"
  url?: string
  title?: string
  fileName?: string
}

export async function resolveFolderForIngest({
  userId,
  sourceType,
  url,
  title,
  fileName,
}: ResolveFolderForIngestParams): Promise<string | null> {
  try {
    console.info("[auto-folder] start", { userId, sourceType, url, title, fileName })

    const provider = await getDefaultProvider(userId, "chat")
    if (!provider) {
      console.warn("[auto-folder] skip: no default chat provider", { userId })
      return null
    }

    const model = getChatModel(provider)
    const agent = new ToolLoopAgent({
      model,
      instructions: `你是导入分配助手。
你只能使用工具做文件夹决策：
1) 必须先调用 listFolders。
2) 如果有合适文件夹，不要创建新文件夹。
3) 只有确实没有合适文件夹时才调用 createFolder。
4) 最终只输出一行：
- FOLDER_ID:<id> 代表分配到该文件夹
- NONE 代表不分配
不要输出其它内容。`,
      tools: {
        listFolders: createListFoldersTool(userId),
        createFolder: createCreateFolderTool(userId),
      },
      stopWhen: stepCountIs(4),
    })

    const result = await agent.generate({
      prompt: `请为以下导入内容分配文件夹：
sourceType: ${sourceType}
url: ${url ?? ""}
title: ${title ?? ""}
fileName: ${fileName ?? ""}`,
    })

    const text = result.text.trim()
    const match = text.match(/^FOLDER_ID:\s*([A-Za-z0-9_-]+)\s*$/i)
    if (match) {
      const folderId = match[1]
      console.info("[auto-folder] choose folder by agent", { folderId, text })
      return folderId
    }

    if (/^NONE$/i.test(text)) {
      console.info("[auto-folder] choose none by agent")
      return null
    }

    for (let i = result.steps.length - 1; i >= 0; i -= 1) {
      const step = result.steps[i]
      for (const toolResult of step.toolResults) {
        if (toolResult.toolName !== "createFolder") {
          continue
        }
        const output = toolResult.output as
          | { success?: boolean; data?: { folder?: { id?: string } } }
          | undefined
        const createdId = output?.data?.folder?.id
        if (output?.success && createdId) {
          console.info("[auto-folder] fallback to created folder from tool result", {
            folderId: createdId,
          })
          return createdId
        }
      }
    }

    console.info("[auto-folder] unrecognized agent output", { text })
    return null
  } catch (error) {
    console.error("[auto-folder] failed", {
      userId,
      sourceType,
      url,
      title,
      fileName,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
