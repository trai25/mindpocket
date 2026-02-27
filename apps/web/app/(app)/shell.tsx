"use client"

import { GlobalSearchDialog } from "@/components/search/global-search-dialog"
import { SidebarLeft } from "@/components/sidebar-left"
import { SidebarProvider } from "@/components/ui/sidebar"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <SidebarLeft variant="inset" />
      {children}
      <GlobalSearchDialog />
    </SidebarProvider>
  )
}
