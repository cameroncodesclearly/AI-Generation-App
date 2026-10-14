import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { DEMO } from "./lib/demo";
import { AuthProvider, useAuth } from "./lib/auth";
import Shell from "./components/Shell";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Create from "./pages/Create";
import Presets from "./pages/Presets";
import PresetEditor from "./pages/PresetEditor";
import Analyze from "./pages/Analyze";
import Library from "./pages/Library";
import Admin from "./pages/Admin";
import Account from "./pages/Account";
import Research from "./pages/Research";

function Guard() {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="grid h-screen place-items-center"><div className="sky" /><div className="display text-3xl animate-pulse">Loading</div></div>;
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Shell />;
}

export default function App() {
  const Router = DEMO ? HashRouter : BrowserRouter;
  return (
    <AuthProvider>
      {DEMO && <div style={{ position: "fixed", bottom: 8, left: 8, zIndex: 70, fontSize: 11, padding: "4px 10px", borderRadius: 999, background: "rgba(217,180,53,.95)", color: "#1a1307", fontWeight: 700 }}>DEMO · mocked data, no real models</div>}
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Guard />}>
            <Route path="/" element={<Home />} />
            <Route path="/create/:kind" element={<Create />} />
            <Route path="/presets" element={<Presets />} />
            <Route path="/presets/new" element={<PresetEditor />} />
            <Route path="/presets/:id/edit" element={<PresetEditor />} />
            <Route path="/analyze" element={<Analyze />} />
            <Route path="/library" element={<Library />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/account" element={<Account />} />
            <Route path="/research" element={<Research />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
