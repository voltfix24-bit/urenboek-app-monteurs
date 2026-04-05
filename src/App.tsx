import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Medewerkers from "./pages/Medewerkers";
import Goedkeuring from "./pages/Goedkeuring";
import Rapportage from "./pages/Rapportage";
import Projecten from "./pages/Projecten";
import Opdrachtgevers from "./pages/Opdrachtgevers";
import Planning from "./pages/Planning";
import ManagerPlanning from "./pages/ManagerPlanning";
import Mededelingen from "./pages/Mededelingen";
import Profiel from "./pages/Profiel";
import Dashboard from "./pages/Dashboard";
import ProjectPlanning from "./pages/ProjectPlanning";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F7F0" }}>
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4A7C2F", borderTopColor: "transparent" }} />
    </div>
  );
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<PublicRoute><Auth /></PublicRoute>} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/medewerkers" element={<ProtectedRoute><Medewerkers /></ProtectedRoute>} />
            <Route path="/goedkeuring" element={<ProtectedRoute><Goedkeuring /></ProtectedRoute>} />
            <Route path="/rapportage" element={<ProtectedRoute><Rapportage /></ProtectedRoute>} />
            <Route path="/projecten" element={<ProtectedRoute><Projecten /></ProtectedRoute>} />
            <Route path="/opdrachtgevers" element={<ProtectedRoute><Opdrachtgevers /></ProtectedRoute>} />
            <Route path="/planning" element={<ProtectedRoute><Planning /></ProtectedRoute>} />
            <Route path="/manager-planning" element={<ProtectedRoute><ManagerPlanning /></ProtectedRoute>} />
            <Route path="/mededelingen" element={<ProtectedRoute><Mededelingen /></ProtectedRoute>} />
            <Route path="/profiel" element={<ProtectedRoute><Profiel /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/projecten/:projectId/planning" element={<ProtectedRoute><ProjectPlanning /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
