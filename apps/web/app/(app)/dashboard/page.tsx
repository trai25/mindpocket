"use client"

import { useCallback, useEffect, useState } from "react"
import { FolderRanking } from "@/components/dashboard/folder-ranking"
import { GrowthChart } from "@/components/dashboard/growth-chart"
import { StatCards } from "@/components/dashboard/stat-cards"
import { TypeDistribution } from "@/components/dashboard/type-distribution"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"

interface DashboardData {
  totalBookmarks: number
  weekBookmarks: number
  totalChats: number
  embeddingRate: number
  typeDistribution: Array<{ type: string; count: number }>
  folderRanking: Array<{ name: string; emoji: string; count: number }>
  growthTrend: Array<{ date: string; count: number }>
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  const fetchData = useCallback(async (d: number) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/dashboard?days=${d}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(days)
  }, [fetchData, days])

  const handleDaysChange = useCallback((d: number) => {
    setDays(d)
  }, [])

  return (
    <SidebarInset className="flex min-w-0 flex-col overflow-hidden">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 bg-background">
        <div className="flex flex-1 items-center gap-2 px-3">
          <SidebarTrigger />
          <Separator className="mr-2 data-[orientation=vertical]:h-4" orientation="vertical" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage className="line-clamp-1">数据看板</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <DashboardContent
          data={data}
          days={days}
          loading={loading}
          onDaysChange={handleDaysChange}
        />
      </div>
    </SidebarInset>
  )
}

function DashboardContent({
  data,
  days,
  loading,
  onDaysChange,
}: {
  data: DashboardData | null
  days: number
  loading: boolean
  onDaysChange: (d: number) => void
}) {
  if (loading && !data) {
    return <DashboardSkeleton />
  }

  if (!data) {
    return <p className="text-muted-foreground text-center">暂无数据</p>
  }

  return (
    <>
      <StatCards
        embeddingRate={data.embeddingRate}
        totalBookmarks={data.totalBookmarks}
        totalChats={data.totalChats}
        weekBookmarks={data.weekBookmarks}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <GrowthChart data={data.growthTrend} days={days} onDaysChange={onDaysChange} />
        <TypeDistribution data={data.typeDistribution} />
      </div>
      <FolderRanking data={data.folderRanking} />
    </>
  )
}

const skeletonKeys = ["stat-1", "stat-2", "stat-3", "stat-4"]

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {skeletonKeys.map((key) => (
          <div className="bg-muted/50 h-30 animate-pulse rounded-xl" key={key} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-muted/50 h-[350px] animate-pulse rounded-xl" />
        <div className="bg-muted/50 h-[350px] animate-pulse rounded-xl" />
      </div>
      <div className="bg-muted/50 h-[350px] animate-pulse rounded-xl" />
    </div>
  )
}
