import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { EventView } from './components/EventView';
import { loadFaceModels } from './ml';
import { BrainCircuit } from 'lucide-react';
import { SettingsProvider } from './contexts/SettingsContext';
import { ScannerProvider } from './contexts/ScannerContext';
import { SettingsModal } from './components/SettingsModal';

function AppContent() {
  const [activeEventId, setActiveEventId] = useState<number | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        await loadFaceModels();
        setModelsLoading(false);
      } catch (err) {
        console.error("Failed to load face-api models", err);
        setModelsError(true);
      }
    }
    init();
  }, []);

  if (modelsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-white flex flex-col items-center justify-center gap-6 p-4 text-center transition-colors">
        {/* Loading Spinner with Brain Circuit Icon */}
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <BrainCircuit className="w-8 h-8 text-amber-600 dark:text-amber-400 animate-pulse" />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">מפעיל בינה מלאכותית מקומית...</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm leading-relaxed">
            טוען את מודלי זיהוי הפנים לדפדפן שלך.
            <br />
            העיבוד מתבצע בצורה מאובטחת ומקומית לחלוטין ללא שרת.
          </p>
        </div>
        <div className="w-48 bg-slate-200 dark:bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-300 dark:border-slate-800">
          <div className="bg-amber-500 h-full rounded-full w-2/3 animate-pulse" />
        </div>
      </div>
    );
  }

  if (modelsError) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-white flex flex-col items-center justify-center gap-4 p-4 text-center transition-colors">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 dark:text-red-400">
          <BrainCircuit className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">שגיאה באתחול מנוע ה-AI</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md leading-relaxed">
          לא הצלחנו לטעון את משקולות מודל הפנים מתיקיית השרת המקומית. 
          אנא ודא שהקבצים קיימים בתיקייה <code>public/models/</code> וששרת הפיתוח פועל.
        </p>
      </div>
    );
  }

  return (
    <>
      <SettingsModal />
      <div className="min-h-screen bg-slate-50 dark:bg-[#111113] text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-300">
      {activeEventId === null ? (
        <Dashboard onSelectEvent={setActiveEventId} />
      ) : (
        <EventView eventId={activeEventId} onBack={() => setActiveEventId(null)} />
      )}
    </div>
    </>
  );
}

function App() {
  return (
    <SettingsProvider>
      <ScannerProvider>
        <AppContent />
      </ScannerProvider>
    </SettingsProvider>
  );
}

export default App;
// Remove unused import React
