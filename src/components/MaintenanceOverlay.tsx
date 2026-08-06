import { ShieldAlert, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function MaintenanceOverlay() {
  const { signOut, user } = useAuth();

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background text-on-background px-4 py-8 text-center"
      role="alertdialog"
      aria-labelledby="maintenance-title"
      aria-describedby="maintenance-desc"
    >
      <div className="max-w-md w-full bg-surface-container border border-copper-accent/30 rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-6 backdrop-blur-lg">
        <div className="w-16 h-16 rounded-full bg-copper-accent/10 border border-copper-accent/40 flex items-center justify-center text-copper-accent animate-pulse">
          <ShieldAlert className="w-8 h-8" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 id="maintenance-title" className="text-2xl font-bold font-headline-lg text-on-surface">
            מצב תחזוקה פעיל
          </h1>
          <p id="maintenance-desc" className="text-sage-muted text-sm leading-relaxed">
            האתר נמצא כעת בתחזוקה מתוכננת לשם שדרוג המערכת ושיפור ביצועי הזיהוי. אנו פועלים להחזיר את השירות לפעילות מלאה בהקדם.
          </p>
        </div>

        <div className="w-full border-t border-outline-variant/30 pt-6 flex flex-col gap-3">
          <button
            onClick={handleRefresh}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-copper-accent hover:bg-copper-accent/90 text-white font-medium rounded-lg transition-colors focus:ring-2 focus:ring-copper-accent focus:outline-none"
          >
            <RefreshCw className="w-4 h-4" />
            <span>רענן עמוד</span>
          </button>

          {user && (
            <button
              onClick={signOut}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface font-medium rounded-lg border border-outline-variant/30 transition-colors focus:ring-2 focus:ring-copper-accent focus:outline-none"
            >
              <LogOut className="w-4 h-4" />
              <span>התנתק מהחשבון</span>
            </button>
          )}
        </div>

        <div className="text-xs text-sage-muted/70">
          EventTag Privacy-First Photo Sharing
        </div>
      </div>
    </div>
  );
}
