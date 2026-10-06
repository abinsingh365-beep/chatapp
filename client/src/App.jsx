import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AuthPage from './pages/AuthPage.jsx'
import ChatPage from './pages/ChatPage.jsx'
import { TOKEN_KEY, USER_KEY } from './lib/api.js'

function AppRoutes() {
  useLocation()
  const hasSession = Boolean(localStorage.getItem(TOKEN_KEY) && localStorage.getItem(USER_KEY))

  return (
    <Routes>
      <Route path="/" element={hasSession ? <Navigate to="/chat" replace /> : <AuthPage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return <HashRouter><AppRoutes /></HashRouter>
}

export default App
