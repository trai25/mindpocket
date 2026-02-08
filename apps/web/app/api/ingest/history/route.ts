import { and, desc, eq, type SQL } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { db } from "@/db/client"
import { bookmark } from "@/db/schema/bookmark"
import { auth } from "@/lib/auth"
import { INGEST_STATUSES } from "@/lib/ingest/types"

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 100)
  const offset = Number(searchParams.get("offset")) || 0

  const conditions: SQL[] = [eq(bookmark.userId, session.user.id)]

  if (status && INGEST_STATUSES.includes(status as (typeof INGEST_STATUSES)[number])) {
    conditions.push(eq(bookmark.ingestStatus, status))
  }

  const items = await db
    .select({
      id: bookmark.id,
      title: bookmark.title,
      type: bookmark.type,
      sourceType: bookmark.sourceType,
      ingestStatus: bookmark.ingestStatus,
      ingestError: bookmark.ingestError,
      url: bookmark.url,
      createdAt: bookmark.createdAt,
    })
    .from(bookmark)
    .where(and(...conditions))
    .orderBy(desc(bookmark.createdAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json({ items })
}
