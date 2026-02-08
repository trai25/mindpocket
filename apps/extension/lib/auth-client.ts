import { createAuthClient } from "better-auth/react"

const TOKEN_KEY = "mindpocket_token"

export async function getToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(TOKEN_KEY)
  return result[TOKEN_KEY] || null
}

export async function setToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token })
}

export async function removeToken(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_KEY)
}

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  fetchOptions: {
    async onRequest(ctx) {
      const token = await getToken()
      if (token) {
        ctx.options.headers = new Headers(ctx.options.headers)
        ctx.options.headers.set("Authorization", `Bearer ${token}`)
      }
    },
    async onSuccess(ctx) {
      const token = ctx.data?.token
      if (typeof token === "string" && token) {
        await setToken(token)
      }
    },
  },
})
