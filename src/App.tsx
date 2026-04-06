import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, type RolPermissies } from "@/hooks/useAuth";
import { ProfileProvider } from "@/hooks/useProfile";
import { NavBadgesProvider } from "@/hooks/useNavBadges";
import { AppErrorBoundary, RouteErrorBoundary } from "@/components/AppErrorBoundary";
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

import { Spinner } from "@/components/ui/Spinner";

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
      <Spinner center={false} />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RoleRoute({ children, check }: { children: React.ReactNode; check: (p: RolPermissies) => boolean }) {
  const { permissies, loading, session } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (!check(permissies)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, permissies } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to={permissies.zietDashboard ? "/dashboard" : "/"} replace />;
  return <>{children}</>;
}

const RB = ({ children }: { children: React.ReactNode }) => (
  <RouteErrorBoundary>{children}</RouteErrorBoundary>
);

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <ProfileProvider>
            <NavBadgesProvider>
            <Routes>
              <Route path="/login" element={<PublicRoute><RB><Auth /></RB></PublicRoute>} />
              <Route path="/setup" element={<RB><Setup /></RB>} />
              <Route path="/reset-password" element={<RB><ResetPassword /></RB>} />
              <Route path="/auth/callback" element={<RB><AuthCallback /></RB>} />
              <Route path="/onboarding" element={<ProtectedRoute><RB><Onboarding /></RB></ProtectedRoute>} />

              <Route path="/" element={<ProtectedRoute><RB><Index /></RB></ProtectedRoute>} />
              <Route path="/planning" element={<RoleRoute check={p => p.zietPlanning}><RB><Planning /></RB></RoleRoute>} />
              <Route path="/mededelingen" element={<RoleRoute check={p => p.zietMededelingen}><RB><Mededelingen /></RB></RoleRoute>} />
              <Route path="/profiel" element={<ProtectedRoute><RB><Profiel /></RB></ProtectedRoute>} />
              <Route path="/mijn-orders" element={<RoleRoute check={p => p.zietInkooporders}><RB><MijnOrders /></RB></RoleRoute>} />

              <Route path="/dashboard" element={<RoleRoute check={p => p.zietDashboard}><RB><Dashboard /></RB></RoleRoute>} />
              <Route path="/goedkeuring" element={<RoleRoute check={p => p.zietGoedkeuring}><RB><Goedkeuring /></RB></RoleRoute>} />
              <Route path="/overuren" element={<RoleRoute check={p => p.zietOveruren}><RB><Overuren /></RB></RoleRoute>} />
              <Route path="/rapportage" element={<RoleRoute check={p => p.zietRapportage}><RB><Rapportage /></RB></RoleRoute>} />
              <Route path="/manager-planning" element={<RoleRoute check={p => p.zietManagerPlanning}><RB><ManagerPlanning /></RB></RoleRoute>} />
              <Route path="/projecten" element={<RoleRoute check={p => p.zietProjecten}><RB><Projecten /></RB></RoleRoute>} />
              <Route path="/projecten/:projectId/planning" element={<RoleRoute check={p => p.zietProjecten}><RB><ProjectPlanning /></RB></RoleRoute>} />
              <Route path="/opdrachtgevers" element={<RoleRoute check={p => p.magTeamBeheren}><RB><Opdrachtgevers /></RB></RoleRoute>} />
              <Route path="/medewerkers" element={<RoleRoute check={p => p.zietTeam}><RB><Medewerkers /></RB></RoleRoute>} />
              <Route path="/inkooporders" element={<RoleRoute check={p => p.zietAlleInkooporders}><RB><Inkooporders /></RB></RoleRoute>} />

              <Route path="/beheer/intake-regels" element={<RoleRoute check={p => p.zietBeheer}><RB><IntakeRegelBeheer /></RB></RoleRoute>} />
              <Route path="/beheer/tarieven" element={<RoleRoute check={p => p.zietBeheer}><RB><TarievenBeheer /></RB></RoleRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
            </NavBadgesProvider>
            </ProfileProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
