import { and, eq } from "drizzle-orm"
import { db } from "@/db/client"
import { folder } from "@/db/schema/folder"

export async function getFolderById({ id, userId }: { id: string; userId: string }) {
  const result = await db
    .select({
      id: folder.id,
      name: folder.name,
      description: folder.description,
      emoji: folder.emoji,
    })
    .from(folder)
    .where(and(eq(folder.id, id), eq(folder.userId, userId)))
    .limit(1)

  return result[0] ?? null
}
