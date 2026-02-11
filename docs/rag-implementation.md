# RAG 实现架构

本文档详细说明 MindPocket 项目中 RAG（Retrieval-Augmented Generation，检索增强生成）系统的实现。

## 概述

MindPocket 使用 RAG 技术从用户的书签知识库中检索相关信息，增强 AI 对话能力。系统支持混合检索（关键词 + 语义搜索），并通过 Vercel AI SDK 的工具调用机制让 AI 自主决定何时检索知识库。

## 技术栈

- **向量数据库**: PostgreSQL + pgvector 扩展
- **Embedding 模型**: 阿里云 DashScope `text-embedding-v4` (1024 维)
- **ORM**: Drizzle ORM
- **AI SDK**: Vercel AI SDK
- **向量索引**: HNSW (Hierarchical Navigable Small World)

## 核心组件

### 1. 向量数据库层

**文件**: `apps/web/db/schema/embedding.ts`

```typescript
export const embedding = pgTable(
  "embedding",
  {
    id: text("id").primaryKey(),
    bookmarkId: text("bookmark_id")
      .notNull()
      .references(() => bookmark.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),
  },
  (table) => [
    index("embedding_bookmarkId_idx").on(table.bookmarkId),
    index("embeddingIndex").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ]
)
```

**特性**:
- 向量维度: 1024
- 索引算法: HNSW (高效的近似最近邻搜索)
- 距离度量: 余弦相似度 (`vector_cosine_ops`)
- 级联删除: bookmark 删除时自动删除关联的 embeddings

### 2. Embedding 生成

**文件**: `apps/web/lib/ai/embedding.ts`

#### 2.1 文本分块

```typescript
const CHUNK_SPLIT_REGEX = /[。.!\n]+/

export function generateChunks(input: string): string[] {
  return input
    .trim()
    .split(CHUNK_SPLIT_REGEX)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
```

**分块策略**:
- 按句号（中英文）、感叹号、换行符分割
- 自动过滤空白内容
- 保持语义完整性

#### 2.2 向量化

```typescript
const embeddingModel = aliyun.embeddingModel("text-embedding-v4")

export async function generateEmbedding(value: string): Promise<number[]> {
  const { embedding: vector } = await embed({
    model: embeddingModel,
    value,
  })
  return vector
}
```

**模型配置**:
- 提供商: 阿里云 DashScope
- 模型: `text-embedding-v4`
- API 端点: `https://dashscope.aliyuncs.com/compatible-mode/v1`

#### 2.3 批量处理

```typescript
const EMBED_BATCH_SIZE = 10

export async function generateEmbeddings(
  bookmarkId: string,
  content: string
): Promise<Array<{ id: string; bookmarkId: string; content: string; embedding: number[] }>> {
  const chunks = generateChunks(content)
  if (chunks.length === 0) return []

  const allEmbeddings: number[][] = []

  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE)
    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: batch,
    })
    allEmbeddings.push(...embeddings)
  }

  return allEmbeddings.map((vector, i) => ({
    id: nanoid(),
    bookmarkId,
    content: chunks[i]!,
    embedding: vector,
  }))
}
```

**优化策略**:
- 批量大小: 10 个 chunk/批次
- 减少 API 调用次数
- 提高处理效率

#### 2.4 相关内容检索

```typescript
export async function findRelevantContent(userId: string, userQuery: string) {
  const userQueryEmbedded = await generateEmbedding(userQuery)
  const similarity = sql<number>`1 - (${cosineDistance(embedding.embedding, userQueryEmbedded)})`

  const results = await db
    .select({
      content: embedding.content,
      bookmarkId: embedding.bookmarkId,
      similarity,
    })
    .from(embedding)
    .innerJoin(bookmark, eq(embedding.bookmarkId, bookmark.id))
    .where(and(
      eq(bookmark.userId, userId),
      eq(bookmark.isArchived, false),
      gt(similarity, 0.3)
    ))
    .orderBy((t) => desc(t.similarity))
    .limit(6)

  return results
}
```

**检索参数**:
- 相似度阈值: 0.3
- 返回数量: Top 6
- 过滤条件: 仅检索用户自己的、未归档的书签

### 3. 内容摄取管道

**文件**: `apps/web/lib/ingest/pipeline.ts`

#### 3.1 摄取流程

系统支持三种内容来源:
1. **URL**: 从网页 URL 提取内容
2. **文件**: 上传文档文件（PDF、Word 等）
3. **浏览器扩展**: 从浏览器扩展传入 HTML

#### 3.2 异步处理架构

```typescript
export async function ingestFromUrl(params: IngestUrlParams): Promise<IngestResult> {
  const bookmarkId = nanoid()

  // 1. 立即创建 bookmark 记录
  await db.insert(bookmark).values({
    id: bookmarkId,
    userId,
    title: userTitle || url,
    url,
    ingestStatus: "pending",
    // ...
  })

  // 2. 触发后台处理（不阻塞响应）
  processIngestUrl(bookmarkId, url, userTitle).catch(console.error)

  return { bookmarkId, title: userTitle || url, status: "pending" }
}
```

**状态流转**:
```
pending → processing → completed/failed
```

#### 3.3 Embedding 生成时机

```typescript
async function processIngestUrl(bookmarkId: string, url: string, userTitle?: string) {
  await updateBookmarkStatus(bookmarkId, "processing")

  try {
    // 1. 内容转换
    const result = await convertUrl(url)

    // 2. 更新 bookmark
    await db.update(bookmark)
      .set({
        title: finalTitle,
        description,
        content: result.markdown,
        ingestStatus: "completed"
      })
      .where(eq(bookmark.id, bookmarkId))

    // 3. 异步生成 embeddings（不阻塞）
    generateAndStoreEmbeddings(bookmarkId, result.markdown).catch(console.error)
  } catch (error) {
    await updateBookmarkStatus(bookmarkId, "failed", error.message)
  }
}
```

**设计优势**:
- 用户立即获得响应
- 内容处理在后台进行
- Embedding 生成不阻塞主流程
- 失败时有明确的错误状态

### 4. 混合搜索系统

**文件**: `apps/web/db/queries/search.ts`

#### 4.1 三种搜索模式

##### 关键词搜索 (Keyword)

```typescript
async function keywordSearch({
  userId, q, limit
}: {
  userId: string
  q: string
  limit: number
}): Promise<SearchHit[]> {
  const likePattern = `%${q}%`

  // 搜索字段: title, description, content, url, tags
  const fieldConditions = or(
    ilike(bookmark.title, likePattern),
    ilike(bookmark.description, likePattern),
    ilike(bookmark.content, likePattern),
    ilike(bookmark.url, likePattern)
  )

  // ...
}
```

**评分权重**:
- title: 5 分
- tag: 4 分
- description: 3 分
- content: 2 分
- url: 1 分

##### 语义搜索 (Semantic)

```typescript
async function semanticSearch({
  userId, q, limit
}: {
  userId: string
  q: string
  limit: number
}): Promise<SearchHit[]> {
  // 1. 查询向量化
  const queryEmbedding = await generateEmbedding(q)

  // 2. 计算余弦相似度
  const similarity = sql<number>`1 - (${cosineDistance(embedding.embedding, queryEmbedding)})`

  // 3. 检索并排序
  const rows = await db
    .select({
      bookmarkId: embedding.bookmarkId,
      score: sql<number>`max(${similarity})`,
    })
    .from(embedding)
    .innerJoin(bookmark, eq(embedding.bookmarkId, bookmark.id))
    .where(and(
      eq(bookmark.userId, userId),
      gt(similarity, 0.3)
    ))
    .groupBy(embedding.bookmarkId)
    .orderBy(desc(sql<number>`max(${similarity})`))
    .limit(limit)

  return rows.map(row => ({
    bookmarkId: row.bookmarkId,
    score: Number(row.score),
    matchReasons: ["semantic"],
  }))
}
```

**特点**:
- 相似度阈值: 0.3
- 按 bookmark 分组（取最高相似度）
- 支持语义理解（同义词、相关概念）

##### 混合搜索 (Hybrid)

```typescript
if (modeUsed === "hybrid") {
  try {
    // 1. 并行执行两种搜索
    const [keywordHits, semanticHits] = await Promise.all([
      keywordSearch({ userId, q: query, limit: candidateLimit }),
      semanticSearch({ userId, q: query, limit: candidateLimit }),
    ])

    // 2. RRF 融合
    hits = fuseRrf([keywordHits, semanticHits], candidateLimit)
  } catch {
    // 3. 降级到关键词搜索
    modeUsed = "keyword"
    fallbackReason = "semantic_failed_fallback_to_keyword"
    hits = await keywordSearch({ userId, q: query, limit: candidateLimit })
  }
}
```

#### 4.2 RRF 融合算法

```typescript
const RRF_K = 60

function fuseRrf(hitLists: SearchHit[][], limit: number): SearchHit[] {
  const map = new Map<string, { score: number; reasons: Set<SearchMatchReason> }>()

  for (const hits of hitLists) {
    for (const [index, hit] of hits.entries()) {
      const rank = index + 1
      const rrfScore = 1 / (RRF_K + rank)  // RRF 公式

      const prev = map.get(hit.bookmarkId)
      if (prev) {
        prev.score += rrfScore  // 累加分数
        for (const reason of hit.matchReasons) {
          prev.reasons.add(reason)
        }
      } else {
        map.set(hit.bookmarkId, {
          score: rrfScore,
          reasons: new Set(hit.matchReasons),
        })
      }
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([bookmarkId, value]) => ({
      bookmarkId,
      score: value.score,
      matchReasons: Array.from(value.reasons),
    }))
}
```

**RRF 算法优势**:
- 不依赖绝对分数，只看排名
- 自动平衡不同检索方式的权重
- 对分数尺度不敏感
- K=60 是经验最优值

#### 4.3 智能降级策略

```typescript
// 查询太短时降级
if (query.length < MIN_SEMANTIC_QUERY_LENGTH &&
    (requestedMode === "semantic" || requestedMode === "hybrid")) {
  modeUsed = "keyword"
  fallbackReason = "query_too_short_for_semantic"
}

// 语义搜索失败时降级
try {
  hits = await semanticSearch({ ... })
} catch {
  modeUsed = "keyword"
  fallbackReason = "semantic_failed_fallback_to_keyword"
  hits = await keywordSearch({ ... })
}
```

**降级场景**:
1. 查询长度 < 2 字符
2. Embedding 生成失败
3. 向量数据库查询失败

### 5. AI 对话集成

**文件**: `apps/web/app/api/chat/route.ts`

#### 5.1 工具定义

```typescript
const result = streamText({
  model: getChatModel(selectedChatModel),
  system: systemPrompt,
  messages: await convertToModelMessages(messages),
  tools: useKnowledgeBase
    ? {
        getInformation: tool({
          description: "从用户的书签知识库中检索相关信息来回答问题。当用户提问时，优先使用此工具搜索知识库。",
          inputSchema: z.object({
            question: z.string().describe("用于搜索知识库的查询语句"),
          }),
          execute: async ({ question }) => findRelevantContent(userId, question),
        }),
      }
    : undefined,
  stopWhen: stepCountIs(useKnowledgeBase ? 3 : 1),
  // ...
})
```

**工具特性**:
- **名称**: `getInformation`
- **描述**: 引导 AI 优先使用知识库
- **输入**: 查询问题字符串
- **输出**: 相关内容列表（Top 6）
- **推理步数**: 最多 3 步（允许多次检索）

#### 5.2 工作流程

```
用户提问
    ↓
AI 分析问题
    ↓
决定是否调用 getInformation 工具
    ↓
[是] → 检索知识库 → 获取相关内容 → 基于内容生成回答
    ↓
[否] → 直接基于模型知识回答
```

#### 5.3 控制参数

```typescript
const {
  id,
  messages,
  selectedChatModel,
  useKnowledgeBase = true,  // 默认启用
} = await req.json()
```

**参数说明**:
- `useKnowledgeBase`: 是否启用知识库检索
- `selectedChatModel`: 选择的 AI 模型
- 默认启用，可按需关闭

## 性能优化

### 1. 向量索引优化

- **HNSW 索引**: 近似最近邻搜索，时间复杂度 O(log n)
- **余弦距离**: 适合文本相似度计算
- **索引参数**: 使用 `vector_cosine_ops` 操作符类

### 2. 批量处理

- **Embedding 生成**: 每批 10 个 chunk
- **减少 API 调用**: 降低延迟和成本
- **并行搜索**: 混合模式下并行执行关键词和语义搜索

### 3. 异步架构

- **非阻塞摄取**: 内容处理不阻塞用户请求
- **后台 Embedding**: 向量生成在后台进行
- **状态追踪**: 通过 `ingestStatus` 字段追踪处理状态

### 4. 智能降级

- **查询长度检查**: 短查询直接用关键词搜索
- **异常处理**: 语义搜索失败时自动降级
- **用户体验**: 保证搜索始终可用

## 配置要求

### 环境变量

```bash
# 阿里云 DashScope API Key
DASHSCOPE_API_KEY=your_api_key

# PostgreSQL 数据库（需支持 pgvector）
DATABASE_URL=postgresql://...
```

### 数据库扩展

```sql
-- 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;
```

### 依赖包

```json
{
  "dependencies": {
    "@ai-sdk/openai-compatible": "^x.x.x",
    "ai": "^x.x.x",
    "drizzle-orm": "^x.x.x",
    "pg": "^x.x.x"
  }
}
```

## 使用示例

### 1. 摄取内容

```typescript
import { ingestFromUrl } from "@/lib/ingest/pipeline"

const result = await ingestFromUrl({
  userId: "user_123",
  url: "https://example.com/article",
  folderId: "folder_456",
  title: "示例文章",
  clientSource: "web",
})

console.log(result.bookmarkId)  // 立即返回 ID
console.log(result.status)      // "pending"
```

### 2. 搜索书签

```typescript
import { searchBookmarks } from "@/db/queries/search"

const results = await searchBookmarks({
  userId: "user_123",
  q: "机器学习",
  mode: "hybrid",  // "keyword" | "semantic" | "hybrid"
  limit: 20,
  offset: 0,
})

console.log(results.items)       // 搜索结果
console.log(results.modeUsed)    // 实际使用的模式
console.log(results.total)       // 总数
```

### 3. AI 对话检索

```typescript
// AI 会自动调用 getInformation 工具
const response = await fetch("/api/chat", {
  method: "POST",
  body: JSON.stringify({
    id: "chat_123",
    messages: [
      { role: "user", content: "我之前收藏的关于 React 的文章有哪些？" }
    ],
    useKnowledgeBase: true,  // 启用知识库
  }),
})
```

## 最佳实践

### 1. 内容质量

- **清晰的标题**: 有助于关键词搜索
- **完整的描述**: 提高检索准确性
- **结构化内容**: Markdown 格式便于分块

### 2. 搜索策略

- **短查询**: 使用关键词模式
- **长查询**: 使用语义或混合模式
- **精确匹配**: 使用关键词模式
- **概念搜索**: 使用语义模式

### 3. 性能调优

- **相似度阈值**: 根据数据质量调整（默认 0.3）
- **返回数量**: 平衡准确性和性能（默认 6）
- **批量大小**: 根据 API 限制调整（默认 10）

### 4. 错误处理

- **检查 ingestStatus**: 确认内容处理完成
- **处理降级**: 准备关键词搜索作为后备
- **监控失败**: 记录并分析失败原因

## 未来优化方向

### 1. 检索增强

- [ ] 支持多模态检索（图片、视频）
- [ ] 实现重排序（Reranking）
- [ ] 添加查询扩展（Query Expansion）
- [ ] 支持过滤条件（日期、标签等）

### 2. 性能提升

- [ ] 实现增量索引更新
- [ ] 添加缓存层（Redis）
- [ ] 优化 chunk 策略（滑动窗口）
- [ ] 支持分布式向量数据库

### 3. 用户体验

- [ ] 显示匹配片段高亮
- [ ] 提供相关性解释
- [ ] 支持搜索历史
- [ ] 个性化排序

### 4. 监控与分析

- [ ] 搜索质量指标
- [ ] 检索延迟监控
- [ ] 用户反馈收集
- [ ] A/B 测试框架

## 参考资料

- [pgvector 文档](https://github.com/pgvector/pgvector)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [阿里云 DashScope](https://help.aliyun.com/zh/dashscope/)
- [HNSW 算法论文](https://arxiv.org/abs/1603.09320)
- [RRF 融合算法](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
