import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ConsentProvider } from './contexts/ConsentContext';
import { ScannerProvider } from './contexts/ScannerContext';
import { ModalProvider } from './contexts/ModalContext';
import { CookieBanner } from './components/CookieBanner';
import { PreferencesModal } from './components/PreferencesModal';
import { Dashboard } from './components/Dashboard';
import { EventView } from './components/EventView';
import { GuestView } from './components/GuestView';
import { LandingPage } from './components/LandingPage';
import { LegalPage } from './components/LegalPage';
import { PrivacyPage } from './components/PrivacyPage';
import { AdminManagement } from './components/AdminManagement';
import { AllowlistManagement } from './components/AllowlistManagement';
import { MaintenanceOverlay } from './components/MaintenanceOverlay';
import { SkipLink } from './components/SkipLink';
import { AccessibilityWidget } from './components/AccessibilityWidget';
import { VercelTrackers } from './components/VercelTrackers';
import { FirebaseAnalytics } from './components/FirebaseAnalytics';
import { UserX, Lock, LogOut } from 'lucide-react';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isBlocked, isAllowlisted, signOut } = useAuth();

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

  // Enforce blocked user restriction at client wrapper level
  if (isBlocked) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-surface-container border border-error/40 rounded-2xl p-8 max-w-md w-full flex flex-col items-center gap-5 shadow-2xl">
          <div className="w-14 h-14 rounded-full bg-error/15 text-error flex items-center justify-center">
            <UserX className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-on-surface">החשבון נחסם</h2>
          <p className="text-sage-muted text-sm leading-relaxed">
            חשבונך נחסם על ידי מנהל המערכת. אינך רשאי לבצע פעולות באפליקציה. לבירורים אנא פנה לתמיכה.
          </p>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-error text-white font-medium rounded-xl hover:bg-error/90 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>התנתק מהחשבון</span>
          </button>
        </div>
      </div>
    );
  }

  // Enforce allowlist restriction at client wrapper level when allowlist mode is on
  if (!isAllowlisted) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-surface-container border border-copper-accent/40 rounded-2xl p-8 max-w-md w-full flex flex-col items-center gap-5 shadow-2xl">
          <div className="w-14 h-14 rounded-full bg-copper-accent/15 text-copper-accent flex items-center justify-center">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-on-surface">הגישה מוגבלת למורשים בלבד</h2>
          <p className="text-sage-muted text-sm leading-relaxed">
            המערכת פועלת כעת במצב רשימת מורשים (Restricted Allowlist). כתובת האימייל שלך אינה ברשימה המאושרת.
          </p>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-container-high border border-outline-variant/30 text-on-surface hover:bg-surface-container-highest font-medium rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>התנתק מהחשבון</span>
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();

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

  if (!user || !isAdmin) {
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
  const { eventId } = useParams<{ eventId: string }>();

  if (!eventId) return <Navigate to="/" replace />;

  return <GuestView eventId={eventId} />;
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function AppRoutes() {
  const { systemSettings, isAdmin } = useAuth();

  return (
    <div className="min-h-screen bg-background text-on-background flex flex-col font-sans transition-colors duration-300">
      <ScrollToTop />
      <SkipLink />
      <CookieBanner />
      <PreferencesModal />
      <AccessibilityWidget />
      <VercelTrackers />
      <FirebaseAnalytics />

      {/* Render Maintenance Overlay for non-admins when maintenanceMode is active */}
      {systemSettings.maintenanceMode && !isAdmin && <MaintenanceOverlay />}

      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/how-it-works" element={<LandingPage />} />
        <Route path="/faq" element={<LandingPage />} />
        <Route path="/qna" element={<LandingPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/event/:eventId" element={<GuestViewWrapper />} />
        <Route path="/legal" element={<LegalPage defaultTab="privacy" />} />
        <Route path="/privacy-policy" element={<LegalPage defaultTab="privacy" />} />
        <Route path="/terms" element={<LegalPage defaultTab="terms" />} />
        <Route path="/accessibility" element={<LegalPage defaultTab="accessibility" />} />
        <Route path="/accessibility-statement" element={<LegalPage defaultTab="accessibility" />} />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminManagement />
            </AdminRoute>
          }
        />
        <Route
          path="/dashboard/admin"
          element={
            <AdminRoute>
              <AdminManagement />
            </AdminRoute>
          }
        />
        <Route
          path="/allowlist"
          element={
            <AdminRoute>
              <AllowlistManagement />
            </AdminRoute>
          }
        />
        <Route
          path="/dashboard/allowlist"
          element={
            <AdminRoute>
              <AllowlistManagement />
            </AdminRoute>
          }
        />

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
            <ModalProvider>
              <ScannerProvider>
                <AppRoutes />
              </ScannerProvider>
            </ModalProvider>
          </ConsentProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
