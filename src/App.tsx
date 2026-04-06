import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProfileProvider } from "@/hooks/useProfile";
import { NavBadgesProvider } from "@/hooks/useNavBadges";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Setup from "./pages/Setup";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from "./pages/AuthCallback";
import Onboarding from "./pages/Onboarding";
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
import Overuren from "./pages/Overuren";
import IntakeRegelBeheer from "./pages/IntakeRegelBeheer";
import TarievenBeheer from "./pages/TarievenBeheer";
import Inkooporders from "./pages/Inkooporders";
import MijnOrders from "./pages/MijnOrders";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
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
          <ProfileProvider>
          <NavBadgesProvider>
          <Routes>
            <Route path="/login" element={<PublicRoute><Auth /></PublicRoute>} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
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
            <Route path="/overuren" element={<ProtectedRoute><Overuren /></ProtectedRoute>} />
            <Route path="/beheer/intake-regels" element={<ProtectedRoute><IntakeRegelBeheer /></ProtectedRoute>} />
            <Route path="/beheer/tarieven" element={<ProtectedRoute><TarievenBeheer /></ProtectedRoute>} />
            <Route path="/inkooporders" element={<ProtectedRoute><Inkooporders /></ProtectedRoute>} />
            <Route path="/mijn-orders" element={<ProtectedRoute><MijnOrders /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </NavBadgesProvider>
          </ProfileProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
