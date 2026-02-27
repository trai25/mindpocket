import {
  type LanguageModel,
  stepCountIs,
  ToolLoopAgent,
  type ToolLoopAgentOnFinishCallback,
  type ToolLoopAgentOnStepFinishCallback,
  type ToolSet,
} from "ai"
import {
  createCreateFolderTool,
  createDeleteFolderTool,
  createListFoldersTool,
  createMoveBookmarkTool,
  createRenameFolderTool,
} from "@/lib/ai/tools/folder-tools"
import { createGetInformationTool } from "@/lib/ai/tools/get-information-tool"

interface CreateChatAgentParams {
  model: LanguageModel
  systemPrompt: string
  userId: string
  useKnowledgeBase: boolean
  useFolderTools: boolean
  onFinish?: ToolLoopAgentOnFinishCallback<ToolSet>
  onStepFinish?: ToolLoopAgentOnStepFinishCallback<ToolSet>
}

export function createChatAgent({
  model,
  systemPrompt,
  userId,
  useKnowledgeBase,
  useFolderTools,
  onFinish,
  onStepFinish,
}: CreateChatAgentParams) {
  const tools: Record<string, ToolSet[string]> = {}
  if (useKnowledgeBase) {
    tools.getInformation = createGetInformationTool(userId)
  }
  if (useFolderTools) {
    tools.listFolders = createListFoldersTool(userId)
    tools.createFolder = createCreateFolderTool(userId)
    tools.renameFolder = createRenameFolderTool(userId)
    tools.deleteFolder = createDeleteFolderTool(userId)
    tools.moveBookmark = createMoveBookmarkTool(userId)
  }

  return new ToolLoopAgent({
    model,
    instructions: systemPrompt,
    tools,
    stopWhen: stepCountIs(Object.keys(tools).length > 0 ? 3 : 1),
    onFinish,
    onStepFinish,
  })
}
