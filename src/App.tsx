import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, type RolPermissies } from "@/hooks/useAuth";
import { ProfileProvider } from "@/hooks/useProfile";
import { NavBadgesProvider } from "@/hooks/useNavBadges";
import { AppErrorBoundary, RouteErrorBoundary } from "@/components/AppErrorBoundary";
import { Spinner } from "@/components/ui/Spinner";

// Critical pages — loaded eagerly
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Setup from "./pages/Setup";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from "./pages/AuthCallback";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";

// Lazy-loaded pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Goedkeuring = lazy(() => import("./pages/Goedkeuring"));
const Rapportage = lazy(() => import("./pages/Rapportage"));
const Projecten = lazy(() => import("./pages/Projecten"));
const Opdrachtgevers = lazy(() => import("./pages/Opdrachtgevers"));
const Planning = lazy(() => import("./pages/Planning"));
const ManagerPlanning = lazy(() => import("./pages/ManagerPlanning"));
const Mededelingen = lazy(() => import("./pages/Mededelingen"));
const Profiel = lazy(() => import("./pages/Profiel"));
const ProjectPlanning = lazy(() => import("./pages/ProjectPlanning"));
const Overuren = lazy(() => import("./pages/Overuren"));
const Medewerkers = lazy(() => import("./pages/Medewerkers"));
const IntakeRegelBeheer = lazy(() => import("./pages/IntakeRegelBeheer"));
const TarievenBeheer = lazy(() => import("./pages/TarievenBeheer"));
const Inkooporders = lazy(() => import("./pages/Inkooporders"));
const MijnOrders = lazy(() => import("./pages/MijnOrders"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
      <Spinner center={false} />
    </div>
  );
}

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
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

const L = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageLoader />}><RB>{children}</RB></Suspense>
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
              {/* Public — eager */}
              <Route path="/login" element={<PublicRoute><RB><Auth /></RB></PublicRoute>} />
              <Route path="/setup" element={<RB><Setup /></RB>} />
              <Route path="/reset-password" element={<RB><ResetPassword /></RB>} />
              <Route path="/auth/callback" element={<RB><AuthCallback /></RB>} />
              <Route path="/onboarding" element={<ProtectedRoute><RB><Onboarding /></RB></ProtectedRoute>} />

              {/* Index — eager (monteur start page) */}
              <Route path="/" element={<ProtectedRoute><RB><Index /></RB></ProtectedRoute>} />

              {/* Lazy routes */}
              <Route path="/planning" element={<RoleRoute check={p => p.zietPlanning}><L><Planning /></L></RoleRoute>} />
              <Route path="/mededelingen" element={<RoleRoute check={p => p.zietMededelingen}><L><Mededelingen /></L></RoleRoute>} />
              <Route path="/profiel" element={<ProtectedRoute><L><Profiel /></L></ProtectedRoute>} />
              <Route path="/mijn-orders" element={<RoleRoute check={p => p.zietInkooporders}><L><MijnOrders /></L></RoleRoute>} />

              <Route path="/dashboard" element={<RoleRoute check={p => p.zietDashboard}><L><Dashboard /></L></RoleRoute>} />
              <Route path="/goedkeuring" element={<RoleRoute check={p => p.zietGoedkeuring}><L><Goedkeuring /></L></RoleRoute>} />
              <Route path="/overuren" element={<RoleRoute check={p => p.zietOveruren}><L><Overuren /></L></RoleRoute>} />
              <Route path="/rapportage" element={<RoleRoute check={p => p.zietRapportage}><L><Rapportage /></L></RoleRoute>} />
              <Route path="/manager-planning" element={<RoleRoute check={p => p.zietManagerPlanning}><L><ManagerPlanning /></L></RoleRoute>} />
              <Route path="/projecten" element={<RoleRoute check={p => p.zietProjecten}><L><Projecten /></L></RoleRoute>} />
              <Route path="/projecten/:projectId/planning" element={<RoleRoute check={p => p.zietProjecten}><L><ProjectPlanning /></L></RoleRoute>} />
              <Route path="/opdrachtgevers" element={<RoleRoute check={p => p.magTeamBeheren}><L><Opdrachtgevers /></L></RoleRoute>} />
              <Route path="/medewerkers" element={<RoleRoute check={p => p.zietTeam}><L><Medewerkers /></L></RoleRoute>} />
              <Route path="/inkooporders" element={<RoleRoute check={p => p.zietAlleInkooporders}><L><Inkooporders /></L></RoleRoute>} />

              <Route path="/beheer/intake-regels" element={<RoleRoute check={p => p.zietBeheer}><L><IntakeRegelBeheer /></L></RoleRoute>} />
              <Route path="/beheer/tarieven" element={<RoleRoute check={p => p.zietBeheer}><L><TarievenBeheer /></L></RoleRoute>} />

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
