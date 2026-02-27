/**
 * Shared type definitions for Zustand stores
 * Extracted from component files to centralize type management
 */

import type { SearchMode } from "@/lib/search/types"

// ============================================================================
// User Types
// ============================================================================

export interface UserInfo {
  name: string
  email: string
  avatar: string
}

// ============================================================================
// Chat Types
// ============================================================================

export interface ChatItem {
  id: string
  title: string
  createdAt: string
}

// ============================================================================
// Folder Types
// ============================================================================

export interface FolderItem {
  id: string
  name: string
  description?: string | null
  emoji: string
  sortOrder: number
  items: BookmarkItemInFolder[]
}

export interface BookmarkItemInFolder {
  id: string
  title: string
}

// ============================================================================
// Bookmark Types
// ============================================================================

export interface BookmarkItem {
  id: string
  type: string
  title: string
  description: string | null
  url: string | null
  coverImage: string | null
  isFavorite: boolean
  createdAt: string
  folderId: string | null
  folderName: string | null
  folderEmoji: string | null
  platform: string | null
}

export interface BookmarkFilters {
  type: string
  platform: string
  folderId?: string
}

export interface BookmarkPagination {
  offset: number
  limit: number
  hasMore: boolean
  total: number
}

// ============================================================================
// UI Types
// ============================================================================

export type ViewMode = "grid" | "list"

export interface SearchDialogState {
  open: boolean
  mode: SearchMode
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

export interface CacheMap<T> {
  [key: string]: CacheEntry<T>
}
