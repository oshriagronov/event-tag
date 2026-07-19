import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ConsentProvider } from './contexts/ConsentContext';
import { ScannerProvider } from './contexts/ScannerContext';
import { CookieBanner } from './components/CookieBanner';
import { PreferencesModal } from './components/PreferencesModal';
import { Dashboard } from './components/Dashboard';
import { EventView } from './components/EventView';
import { GuestView } from './components/GuestView';
import { LandingPage } from './components/LandingPage';
import { LegalPage } from './components/LegalPage';
import { useParams, useNavigate } from 'react-router-dom';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-copper-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sage-muted text-sm">טוען...</span>
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

  return (
    <EventView
      eventId={eventId}
      onBack={() => navigate('/dashboard')}
    />
  );
}

function GuestViewWrapper() {
  const { shareCode } = useParams<{ shareCode: string }>();

  if (!shareCode) return <Navigate to="/" replace />;

  return <GuestView shareCode={shareCode} />;
}

import { PrivacyPage } from './components/PrivacyPage';
import { SkipLink } from './components/SkipLink';
import { AccessibilityWidget } from './components/AccessibilityWidget';

function AppRoutes() {
  return (
    <div className="min-h-screen bg-background text-on-background flex flex-col font-sans transition-colors duration-300">
      <SkipLink />
      <CookieBanner />
      <PreferencesModal />
      <AccessibilityWidget />
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/event/:shareCode" element={<GuestViewWrapper />} />
        <Route path="/legal" element={<LegalPage defaultTab="privacy" />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/privacy-policy" element={<LegalPage defaultTab="privacy" />} />
        <Route path="/terms" element={<LegalPage defaultTab="terms" />} />
        <Route path="/accessibility" element={<LegalPage defaultTab="accessibility" />} />
        <Route path="/accessibility-statement" element={<LegalPage defaultTab="accessibility" />} />

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
          <ConsentProvider>
            <ScannerProvider>
              <AppRoutes />
            </ScannerProvider>
          </ConsentProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
