import { getToken } from "./auth-client"

const API_BASE = "http://localhost:3000"

export async function saveBookmark(payload: { url: string; html: string; title?: string }) {
  const token = await getToken()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}/api/ingest`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  return { ok: res.ok, status: res.status, data }
}
