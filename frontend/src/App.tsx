import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ScannerProvider } from './contexts/ScannerContext';
import { SettingsModal } from './components/SettingsModal';
import { Dashboard } from './components/Dashboard';
import { EventView } from './components/EventView';
import { GuestView } from './components/GuestView';
import { LandingPage } from './components/LandingPage';
import { useParams, useNavigate } from 'react-router-dom';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#111113] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-500 dark:text-slate-400 text-sm">טוען...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function EventViewWrapper() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();

  if (!eventId) return <Navigate to="/dashboard" replace />;

  // Parse as integer only if it is fully numeric, preserving it as a string for cloud events
  const parsedId = /^\d+$/.test(eventId) ? parseInt(eventId, 10) : eventId;

  return (
    <EventView
      eventId={parsedId}
      onBack={() => navigate('/dashboard')}
    />
  );
}

function GuestViewWrapper() {
  const { shareCode } = useParams<{ shareCode: string }>();

  if (!shareCode) return <Navigate to="/" replace />;

  return <GuestView shareCode={shareCode} />;
}

function AppRoutes() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-300">
      <SettingsModal />
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/event/:shareCode" element={<GuestViewWrapper />} />

        {/* Protected owner routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/event/:eventId"
          element={
            <ProtectedRoute>
              <EventViewWrapper />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <ScannerProvider>
            <AppRoutes />
          </ScannerProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
