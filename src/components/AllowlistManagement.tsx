import { useState, useMemo } from 'react';
import {
  Lock,
  Plus,
  Trash2,
  Search,
  CheckCircle,
  AlertTriangle,
  Globe,
  UserCheck,
  Shield,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useModal } from '../contexts/ModalContext';
import { useTranslation } from '../services/translations';
import {
  addToAllowlist,
  removeFromAllowlist,
  updateSystemSettings,
} from '../services/adminService';

interface AllowlistManagementProps {
  embedded?: boolean;
}

export function AllowlistManagement({ embedded = false }: AllowlistManagementProps) {
  const { user, isAdmin, systemSettings, allowlist } = useAuth();
  const { confirm, alert } = useModal();
  const { t, isRtl, language } = useTranslation();

  const [newEmail, setNewEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtered allowlist emails
  const filteredAllowlist = useMemo(() => {
    return allowlist.filter((item) =>
      !searchQuery.trim() || item.email.toLowerCase().includes(searchQuery.trim().toLowerCase())
    );
  }, [allowlist, searchQuery]);

  if (!isAdmin) {
    return (
      <div dir={isRtl ? 'rtl' : 'ltr'} className="p-8 text-center text-on-background">
        <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold">{t('admin.accessDenied')}</h2>
      </div>
    );
  }

  // Handle Single Add
  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !user) return;

    setIsSubmitting(true);
    try {
      await addToAllowlist(newEmail.trim(), user.uid);
      setNewEmail('');
    } catch (err) {
      console.error('Failed to add to allowlist:', err);
      alert({ title: t('common.error'), message: 'הוספת האימייל לרשימה נכשלה.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Single Remove
  const handleRemoveEmail = async (email: string) => {
    const confirmed = await confirm({
      title: 'הסרה מהרשימה המאושרת',
      message: `האם להסיר את ${email} מהרשימה המאושרת?`,
      confirmText: 'הסר',
      variant: 'danger',
    });

    if (confirmed) {
      try {
        await removeFromAllowlist(email);
        setSelectedEmails((prev) => prev.filter((e) => e !== email));
      } catch (err) {
        console.error('Failed to remove from allowlist:', err);
        alert({ title: t('common.error'), message: 'הסרת האימייל מהרשימה נכשלה.' });
      }
    }
  };

  // Handle Bulk Remove
  const handleBulkRemove = async () => {
    if (!selectedEmails.length) return;
    const confirmed = await confirm({
      title: 'הסרה גורפת מהרשימה',
      message: `האם להסיר ${selectedEmails.length} כתובות אימייל מהרשימה המאושרת?`,
      confirmText: 'הסר הכל',
      variant: 'danger',
    });

    if (confirmed) {
      try {
        await Promise.all(selectedEmails.map((e) => removeFromAllowlist(e)));
        setSelectedEmails([]);
      } catch (err) {
        console.error('Failed to bulk remove from allowlist:', err);
        alert({ title: t('common.error'), message: 'הסרה גורפת נכשלה.' });
      }
    }
  };

  // Toggle All Selection
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedEmails(filteredAllowlist.map((item) => item.email));
    } else {
      setSelectedEmails([]);
    }
  };

  // Toggle Single Selection
  const handleSelectOne = (email: string, checked: boolean) => {
    if (checked) {
      setSelectedEmails((prev) => [...prev, email]);
    } else {
      setSelectedEmails((prev) => prev.filter((e) => e !== email));
    }
  };

  // Toggle Login Access Mode (Open vs Restricted)
  const handleToggleMode = async (enableRestricted: boolean) => {
    if (!user) return;
    try {
      await updateSystemSettings({ allowlistMode: enableRestricted }, user.uid);
    } catch (err) {
      console.error('Failed to update system mode:', err);
      alert({ title: t('common.error'), message: 'עדכון מצב המערכת נכשל.' });
    }
  };

  const content = (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="space-y-6 w-full max-w-6xl mx-auto text-on-background">
      {/* Header Banner */}
      <div className="bg-surface-container p-6 rounded-2xl border border-surface-border flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-copper-accent/15 text-copper-accent rounded-xl border border-copper-accent/30 shrink-0">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-display-lg text-2xl font-bold text-on-background">ניהול רשימה מאושרת (Allow List)</h2>
            <p className="text-sage-muted text-sm mt-0.5">
              הגדרת כתובות אימייל המורשות להתחבר לאפליקציה כאשר מצב הגישה מוגדר כ-Restricted.
            </p>
          </div>
        </div>

        {/* Access Mode Toggle */}
        <div className="flex items-center gap-1 bg-surface-container-high p-1 rounded-xl border border-surface-border shrink-0">
          <button
            onClick={() => handleToggleMode(false)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border-none ${
              !systemSettings.allowlistMode
                ? 'bg-surface-container text-on-background shadow-sm border border-surface-border'
                : 'text-sage-muted hover:text-on-background bg-transparent'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-copper-accent" />
            <span>התחברות פתוחה</span>
          </button>

          <button
            onClick={() => handleToggleMode(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border-none ${
              systemSettings.allowlistMode
                ? 'bg-copper-accent text-background shadow-sm'
                : 'text-sage-muted hover:text-on-background bg-transparent'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>רשימה מאושרת בלבד</span>
          </button>
        </div>
      </div>

      {/* Mode Alert Status */}
      {systemSettings.allowlistMode ? (
        <div className="bg-copper-accent/15 border border-copper-accent/40 rounded-xl p-4 flex items-center gap-3 text-copper-accent">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="text-xs font-semibold">
            מצב רשימה מאושרת <strong>פעיל כעת</strong>. רק משתמשים המופיעים ברשימה למטה יוכלו להתחבר לאפליקציה.
          </span>
        </div>
      ) : (
        <div className="bg-surface-container-high border border-surface-border rounded-xl p-4 flex items-center gap-3 text-sage-muted">
          <CheckCircle className="w-5 h-5 shrink-0 text-emerald-400" />
          <span className="text-xs">
            מצב התחברות פתוח <strong>פעיל כעת</strong>. כל משתמש רשאי להתחבר באופן חופשי.
          </span>
        </div>
      )}

      {/* Form: Add New Email */}
      <form onSubmit={handleAddEmail} className="bg-surface-container p-5 rounded-2xl border border-surface-border shadow-sm">
        <label className="block text-xs font-bold text-sage-muted uppercase tracking-wider mb-2">
          הוספת אימייל חדש לרשימה המאושרת
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="example@domain.com"
            dir="ltr"
            required
            className="flex-1 bg-surface-container-low border border-surface-border rounded-xl px-4 py-2.5 text-on-background text-sm focus:border-copper-accent outline-none"
          />
          <button
            type="submit"
            disabled={isSubmitting || !newEmail.trim()}
            className="px-6 py-2.5 bg-copper-accent hover:bg-copper-accent/90 text-background rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow shrink-0 border-none"
          >
            <Plus className="w-4 h-4" />
            <span>הוסף לרשימה</span>
          </button>
        </div>
      </form>

      {/* Main Table Container */}
      <div className="bg-surface-container rounded-2xl border border-surface-border p-6 space-y-6 shadow-xl">
        {/* Toolbar with Match Site Search Bar Style */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative w-full sm:w-80 flex items-center bg-surface-container-low rounded-full px-4 py-2 border border-surface-border focus-within:border-copper-accent/50 transition-colors shadow-sm">
            <Search className={`text-sage-muted shrink-0 w-4.5 h-4.5 ${isRtl ? 'ml-2' : 'mr-2'}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש אימייל ברשימה..."
              dir="auto"
              className="bg-transparent border-none focus:ring-0 text-sm text-on-background w-full placeholder-sage-muted outline-none pe-6"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className={`absolute p-1 rounded-full text-sage-muted hover:text-on-background hover:bg-surface-container-high transition-all cursor-pointer border-none bg-transparent ${
                  isRtl ? 'left-3' : 'right-3'
                }`}
                title={language === 'he' ? 'נקה חיפוש' : 'Clear search'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between w-full sm:w-auto gap-4">
            <span className="text-xs text-sage-muted font-mono font-bold">
              סה״כ: {allowlist.length} מורשים
            </span>

            {/* Bulk Remove Button */}
            {selectedEmails.length > 0 && (
              <button
                onClick={handleBulkRemove}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 rounded-xl text-xs font-bold transition-all cursor-pointer shadow border-none"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>הסר מורשים שנבחרו ({selectedEmails.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Allowlist Table */}
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-start border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-surface-border bg-surface-container-low/60 text-sage-muted text-xs uppercase font-bold tracking-wider">
                <th className="py-3 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      selectedEmails.length === filteredAllowlist.length &&
                      filteredAllowlist.length > 0
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded border-surface-border text-copper-accent accent-copper-accent cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4 font-bold text-start">כתובת אימייל מורשת</th>
                <th className="py-3 px-4 font-bold text-start">סטטוס גישה</th>
                <th className="py-3 px-4 font-bold text-end">פעולות</th>
              </tr>
            </thead>

            <tbody className="text-sm">
              {filteredAllowlist.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sage-muted">
                    רשימת המורשים ריקה או שלא נמצאו כתובות תואמות.
                  </td>
                </tr>
              ) : (
                filteredAllowlist.map((item) => {
                  const isSelected = selectedEmails.includes(item.email);
                  return (
                    <tr
                      key={item.email}
                      className={`border-b border-surface-border/60 hover:bg-surface-container-high/40 transition-colors ${
                        isSelected ? 'bg-surface-container-high/60' : ''
                      }`}
                    >
                      {/* Selection Checkbox */}
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectOne(item.email, e.target.checked)}
                          className="w-4 h-4 rounded border-surface-border text-copper-accent accent-copper-accent cursor-pointer"
                        />
                      </td>

                      {/* Email Address */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-on-background bidi-isolate font-semibold" dir="ltr">
                          {item.email}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold uppercase">
                          <UserCheck className="w-3 h-3 text-emerald-400" /> מורשה להתחבר
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-end">
                        <button
                          onClick={() => handleRemoveEmail(item.email)}
                          className="p-1.5 text-sage-muted hover:text-red-400 hover:bg-red-500/15 rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                          title="הסר מהרשימה"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      {content}
    </div>
  );
}
