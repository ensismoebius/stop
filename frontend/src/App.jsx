import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./state/AuthContext.jsx";
import { PlayerProvider } from "./state/PlayerContext.jsx";
import useAutoFullscreen from "./hooks/useAutoFullscreen.js";
import HomePage from "./pages/HomePage.jsx";
import JoinPage from "./pages/JoinPage.jsx";
import StudentGamePage from "./pages/StudentGamePage.jsx";
import TeacherDashboardPage from "./pages/TeacherDashboardPage.jsx";
import PublicScreenPage from "./pages/PublicScreenPage.jsx";

export function App() {
  // Primeiro toque em qualquer lugar da pagina expande para tela cheia,
  // como no Kahoot — o navegador exige um gesto do usuario para permitir
  // isso, entao nao ha como disparar sozinho no carregamento (spec 24).
  // O painel do professor fica de fora: o professor precisa alternar entre
  // janelas/abas livremente enquanto conduz a partida.
  const location = useLocation();
  useAutoFullscreen({ enabled: !location.pathname.startsWith("/teacher") });

  return (
    <AuthProvider>
      <PlayerProvider>
        <div className="app">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/join/:code" element={<JoinPage />} />
            <Route path="/play" element={<StudentGamePage />} />
            <Route path="/teacher" element={<TeacherDashboardPage />} />
            <Route path="/screen" element={<PublicScreenPage />} />
            <Route path="/screen/:code" element={<PublicScreenPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </PlayerProvider>
    </AuthProvider>
  );
}

export default App;
