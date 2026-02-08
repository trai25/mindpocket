import { useEffect, useState } from "react"
import { authClient, removeToken } from "../../lib/auth-client"
import "./App.css"

interface User {
  id: string
  name: string
  email: string
}
type Status = "idle" | "loading" | "success" | "error"

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    authClient
      .getSession()
      .then((res) => {
        console.log("[MindPocket] getSession:", res)
        if (res.data?.user) {
          setUser(res.data.user as User)
        }
        setChecking(false)
      })
      .catch((err) => {
        console.error("[MindPocket] getSession error:", err)
        setChecking(false)
      })
  }, [])

  if (checking) {
    return (
      <div className="app">
        <p className="status">检查登录状态...</p>
      </div>
    )
  }

  if (!user) {
    return <LoginForm onLogin={setUser} />
  }

  return <SavePage onLogout={() => setUser(null)} user={user} />
}

function LoginForm({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("loading")
    setError("")

    const res = await authClient.signIn.email({ email, password })
    console.log("[MindPocket] signIn:", res)
    if (res.data?.user) {
      setStatus("success")
      onLogin(res.data.user as User)
    } else {
      setStatus("error")
      setError(res.error?.message || "登录失败，请检查邮箱和密码")
    }
  }

  return (
    <div className="app">
      <h1 style={{ fontSize: 16, fontWeight: 600 }}>MindPocket</h1>
      <form className="form" onSubmit={handleSubmit}>
        <input
          className="input"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="邮箱"
          required
          type="email"
          value={email}
        />
        <input
          className="input"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
          required
          type="password"
          value={password}
        />
        <button className="btn btn-primary" disabled={status === "loading"} type="submit">
          {status === "loading" ? "登录中..." : "登录"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  )
}

function SavePage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [status, setStatus] = useState<Status>("idle")
  const [message, setMessage] = useState("")

  const handleSave = async () => {
    setStatus("loading")
    setMessage("")

    const res = await browser.runtime.sendMessage({ type: "SAVE_PAGE" })
    if (res?.success) {
      setStatus("success")
      setMessage(`已保存: ${res.data?.title || "页面"}`)
    } else {
      setStatus("error")
      setMessage(res?.error || "保存失败")
    }
  }

  return (
    <div className="app">
      <div className="header">
        <h1>MindPocket</h1>
        <button
          className="logout-btn"
          onClick={async () => {
            await authClient.signOut()
            await removeToken()
            onLogout()
          }}
          type="button"
        >
          退出
        </button>
      </div>
      <p className="user-info">{user.email}</p>
      <button
        className="btn btn-save"
        disabled={status === "loading"}
        onClick={handleSave}
        type="button"
      >
        {status === "loading" ? "保存中..." : "收藏此页面"}
      </button>
      {status === "success" && <p className="success">{message}</p>}
      {status === "error" && <p className="error">{message}</p>}
    </div>
  )
}

export default App
