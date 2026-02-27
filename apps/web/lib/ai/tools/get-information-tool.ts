import { tool } from "ai"
import { z } from "zod"
import { findRelevantContent } from "@/lib/ai/embedding"

export function createGetInformationTool(userId: string) {
  return tool({
    description:
      "从用户的书签知识库中检索相关信息来回答问题。当用户提问时，优先使用此工具搜索知识库。",
    inputSchema: z.object({
      question: z.string().describe("用于搜索知识库的查询语句"),
    }),
    execute: async ({ question }) => {
      try {
        return await findRelevantContent(userId, question)
      } catch (error) {
        return {
          error: "knowledge_base_search_failed",
          message: error instanceof Error ? error.message : "Unknown tool error",
        }
      }
    },
  })
}
