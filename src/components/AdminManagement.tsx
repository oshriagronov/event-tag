import { useState, useEffect, useMemo, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  Shield,
  Power,
  UserCheck,
  UserX,
  Crown,
  ArrowRight,
  CheckCircle,
  Calendar,
  Lock,
  Globe,
  AlertTriangle,
  LayoutDashboard,
  Settings,
  HelpCircle,
  X,
  Activity,
  ShieldAlert,
  FileSpreadsheet,
  Sliders,
  Download,
  Upload,
  Cloud,
  Radio,
  Trash2,
  Zap,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useModal } from '../contexts/ModalContext';
import { useTranslation } from '../services/translations';
import {
  subscribeAllUsers,
  updateSystemSettings,
  bulkUpdateUserStatus,
  bulkUpdateUserPremium,
  bulkAddToAllowlist,
  removeFromAllowlist,
  subscribeSystemHealthMetrics,
  subscribeAuditLogs,
  updateQuotaConfig,
  exportAllowlistCsv,
  DEFAULT_QUOTAS,
  type UserProfile,
  type SystemHealthMetrics,
  type AuditLogEntry,
  type QuotaConfig,
} from '../services/adminService';

interface AdminManagementProps {
  embedded?: boolean;
}

export function AdminManagement({ embedded = false }: AdminManagementProps) {
  const { user, isAdmin, systemSettings, allowlist } = useAuth();
  const { confirm, alert } = useModal();
  const { t, isRtl, language } = useTranslation();
  const navigate = useNavigate();

  // Navigation state
  const [activeNav, setActiveNav] = useState<'users' | 'health' | 'audit_logs' | 'allowlist' | 'quota'>('users');

  // Users state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked' | 'allowlist'>('all');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [isBulkPremiumModal, setIsBulkPremiumModal] = useState(false);
  const [premiumDate, setPremiumDate] = useState('');

  // System Health state
  const [healthMetrics, setHealthMetrics] = useState<SystemHealthMetrics>({
    totalPhotos: 0,
    totalFaces: 0,
    totalEmbeddings: 0,
    googleDriveCount: 0,
    dropboxCount: 0,
    googleDrivePercent: 50,
    dropboxPercent: 50,
    activeEvents: 0,
    scanningEvents: 0,
    completedEvents: 0,
    photosOverTime: [],
    eventTimelines: [],
  });

  // Chart Time Range State ('1d' | '5d' | '1m' | '6m' | '1y' | 'max')
  const [timeRange, setTimeRange] = useState<'1d' | '5d' | '1m' | '6m' | '1y' | 'max'>('5d');

  // Audit Logs state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(true);
  const [auditSearch, setAuditSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'info' | 'warning' | 'security'>('all');

  // Allowlist CSV state
  const [rawCsvInput, setRawCsvInput] = useState('');
  const [allowlistSearch, setAllowlistSearch] = useState('');

  // Quota Config state
  const [quotaForm, setQuotaForm] = useState<QuotaConfig>(systemSettings.quotas || DEFAULT_QUOTAS);
  const [savingQuotas, setSavingQuotas] = useState(false);

  // Sync quota form when system settings arrive
  useEffect(() => {
    if (systemSettings.quotas) {
      setQuotaForm(systemSettings.quotas);
    }
  }, [systemSettings.quotas]);

  // Subscribe to Users
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeAllUsers(
      (userList) => {
        setUsers(userList);
        setLoadingUsers(false);
      },
      (err) => {
        console.error('Failed to subscribe users:', err);
        setLoadingUsers(false);
      }
    );
    return () => unsub();
  }, [isAdmin]);

  // Subscribe to System Health Metrics
  useEffect(() => {
    if (!isAdmin || activeNav !== 'health') return;
    const unsub = subscribeSystemHealthMetrics(
      (metrics) => {
        setHealthMetrics(metrics);
      },
      (err) => console.error('Failed to subscribe health metrics:', err)
    );
    return () => unsub();
  }, [isAdmin, activeNav]);

  // Subscribe to Audit Logs
  useEffect(() => {
    if (!isAdmin || activeNav !== 'audit_logs') return;
    setLoadingAuditLogs(true);
    const unsub = subscribeAuditLogs(
      (logs) => {
        setAuditLogs(logs);
        setLoadingAuditLogs(false);
      },
      100,
      (err) => {
        console.error('Failed to subscribe audit logs:', err);
        setLoadingAuditLogs(false);
      }
    );
    return () => unsub();
  }, [isAdmin, activeNav]);

  // Fast set of allowlisted email strings (lowercase)
  const allowlistEmailsSet = useMemo(() => {
    return new Set(allowlist.map((a) => a.email.toLowerCase()));
  }, [allowlist]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        !searchQuery.trim() ||
        u.email.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        u.displayName.toLowerCase().includes(searchQuery.trim().toLowerCase());

      let matchesStatus = true;
      if (statusFilter === 'active') matchesStatus = u.status === 'active';
      else if (statusFilter === 'blocked') matchesStatus = u.status === 'blocked';
      else if (statusFilter === 'allowlist') matchesStatus = allowlistEmailsSet.has(u.email.toLowerCase());

      return matchesSearch && matchesStatus;
    });
  }, [users, searchQuery, statusFilter, allowlistEmailsSet]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const queryLower = auditSearch.trim().toLowerCase();
      const matchesSearch =
        !queryLower ||
        (log.userEmail || '').toLowerCase().includes(queryLower) ||
        (log.action || '').toLowerCase().includes(queryLower) ||
        (typeof log.details === 'string' ? log.details : JSON.stringify(log.details || {})).toLowerCase().includes(queryLower);

      let matchesSeverity = true;
      if (severityFilter !== 'all') matchesSeverity = log.severity === severityFilter;

      return matchesSearch && matchesSeverity;
    });
  }, [auditLogs, auditSearch, severityFilter]);

  // Filtered Allowlist Entries
  const filteredAllowlistEntries = useMemo(() => {
    return allowlist.filter((entry) => {
      return !allowlistSearch.trim() || entry.email.toLowerCase().includes(allowlistSearch.trim().toLowerCase());
    });
  }, [allowlist, allowlistSearch]);

  // Parsed CSV email preview
  const parsedCsvEmails = useMemo(() => {
    if (!rawCsvInput.trim()) return [];
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = rawCsvInput.match(emailRegex) || [];
    return Array.from(new Set(matches.map((e) => e.toLowerCase())));
  }, [rawCsvInput]);

  // Early return for non-admin MUST be after all hooks!
  if (!isAdmin) {
    return (
      <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center text-on-background">
        <div className="bg-surface-container p-8 rounded-2xl border border-red-500/30 max-w-md w-full flex flex-col items-center gap-4 shadow-2xl">
          <Shield className="w-12 h-12 text-red-400" />
          <h1 className="text-xl font-bold font-serif text-on-background">{t('admin.accessDenied')}</h1>
          <p className="text-sage-muted text-sm">{t('admin.accessDenied')}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-4 px-6 py-2.5 bg-copper-accent hover:bg-copper-accent/90 text-background font-bold rounded-xl transition-all text-sm shadow cursor-pointer border-none"
          >
            {t('admin.backToDashboard')}
          </button>
        </div>
      </div>
    );
  }

  // Toggle Maintenance Mode
  const handleToggleMaintenance = async () => {
    const nextState = !systemSettings.maintenanceMode;
    const confirmed = await confirm({
      title: t('admin.maintenanceMode'),
      message: nextState ? t('admin.confirmMaintenanceOn') : t('admin.confirmMaintenanceOff'),
      confirmText: nextState ? t('admin.maintenanceOn') : t('admin.maintenanceOff'),
      variant: nextState ? 'danger' : 'info',
    });

    if (confirmed && user) {
      try {
        await updateSystemSettings({ maintenanceMode: nextState }, user.uid, user.email || undefined);
      } catch (err) {
        console.error('Failed to update maintenance mode:', err);
        alert({ title: t('common.error'), message: 'Failed to update maintenance mode.' });
      }
    }
  };

  // Toggle Allowlist Mode (Open Login vs Restricted)
  const handleToggleAllowlistMode = async (enableRestricted: boolean) => {
    if (!user) return;
    try {
      await updateSystemSettings({ allowlistMode: enableRestricted }, user.uid, user.email || undefined);
    } catch (err) {
      console.error('Failed to update allowlist mode:', err);
      alert({ title: t('common.error'), message: 'Failed to update access mode.' });
    }
  };

  // ---- USER BULK ACTIONS ----
  const handleSelectAllUsers = (checked: boolean) => {
    if (checked) setSelectedUids(filteredUsers.map((u) => u.uid));
    else setSelectedUids([]);
  };

  const handleSelectUser = (uid: string, checked: boolean) => {
    if (checked) setSelectedUids((prev) => [...prev, uid]);
    else setSelectedUids((prev) => prev.filter((id) => id !== uid));
  };

  const handleBulkBlock = async (status: 'active' | 'blocked') => {
    if (!selectedUids.length || !user) return;
    const isBlocking = status === 'blocked';
    const confirmed = await confirm({
      title: isBlocking ? t('admin.bulkBlock') : t('admin.bulkUnblock'),
      message: isBlocking ? t('admin.confirmBlock') : t('admin.confirmUnblock'),
      confirmText: isBlocking ? t('admin.blockUser') : t('admin.unblockUser'),
      variant: isBlocking ? 'danger' : 'info',
    });

    if (confirmed) {
      try {
        await bulkUpdateUserStatus(selectedUids, status, user.uid, user.email || undefined);
        setSelectedUids([]);
      } catch (err) {
        console.error('Failed bulk status update:', err);
        alert({ title: t('common.error'), message: 'Failed bulk status update.' });
      }
    }
  };

  const handleBulkAddToAllowlist = async () => {
    if (!selectedUids.length || !user) return;
    const selectedUsers = users.filter((u) => selectedUids.includes(u.uid));
    const emails = selectedUsers.map((u) => u.email).filter(Boolean);

    const confirmed = await confirm({
      title: t('admin.bulkAllowlist'),
      message: `${t('admin.bulkAllowlist')} (${emails.length})?`,
      confirmText: t('admin.addToAllowlist'),
      variant: 'info',
    });

    if (confirmed) {
      try {
        await bulkAddToAllowlist(emails, user.uid, user.email || undefined);
        setSelectedUids([]);
      } catch (err) {
        console.error('Failed bulk allowlist add:', err);
        alert({ title: t('common.error'), message: 'Failed bulk allowlist add.' });
      }
    }
  };

  const handleOpenBulkPremiumModal = () => {
    setIsBulkPremiumModal(true);
    setPremiumDate('');
  };

  const handleSaveBulkPremium = async () => {
    if (!selectedUids.length || !user) return;
    try {
      await bulkUpdateUserPremium(selectedUids, premiumDate || null, user.uid, user.email || undefined);
      setIsBulkPremiumModal(false);
      setSelectedUids([]);
    } catch (err) {
      console.error('Failed bulk premium update:', err);
      alert({ title: t('common.error'), message: 'Failed bulk premium update.' });
    }
  };

  // ---- CSV IMPORT / EXPORT ACTIONS ----
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) setRawCsvInput(text);
    };
    reader.readAsText(file);
  };

  const handleFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) setRawCsvInput(text);
    };
    reader.readAsText(file);
  };

  const handleImportParsedCsv = async () => {
    if (!parsedCsvEmails.length || !user) return;
    try {
      await bulkAddToAllowlist(parsedCsvEmails, user.uid, user.email || undefined);
      alert({
        title: t('common.success'),
        message: language === 'he' ? `יבוא ${parsedCsvEmails.length} כתובות אימייל לרשימת המורשים הושלם בהצלחה!` : `Successfully imported ${parsedCsvEmails.length} emails to allowlist!`,
      });
      setRawCsvInput('');
    } catch (err) {
      console.error('Failed to import CSV emails:', err);
      alert({ title: t('common.error'), message: 'Failed to import allowlist CSV.' });
    }
  };

  const handleSingleRemoveAllowlist = async (email: string) => {
    if (!user) return;
    const confirmed = await confirm({
      title: t('admin.removeFromAllowlist'),
      message: `${t('admin.removeFromAllowlist')} (${email})?`,
      confirmText: t('admin.removeFromAllowlist'),
      variant: 'danger',
    });
    if (confirmed) {
      try {
        await removeFromAllowlist(email, user.uid, user.email || undefined);
      } catch (err) {
        console.error('Failed to remove allowlist entry:', err);
      }
    }
  };

  // ---- QUOTA FORM ACTION ----
  const handleSaveQuotas = async () => {
    if (!user) return;
    setSavingQuotas(true);
    try {
      await updateQuotaConfig(quotaForm, user.uid, user.email || undefined);
      alert({
        title: t('common.success'),
        message: language === 'he' ? 'מגבלות התוכניות עודכנו ונאכפו בהצלחה בחוקי הדיספצ׳ינג!' : 'Quota limits updated and enforced successfully!',
      });
    } catch (err) {
      console.error('Failed to save quota config:', err);
      alert({ title: t('common.error'), message: 'Failed to update quota limits.' });
    } finally {
      setSavingQuotas(false);
    }
  };

  // Main Canvas Content Wrapper
  const mainCanvasContent = (
    <div className="space-y-6 w-full max-w-6xl mx-auto">
      {/* Maintenance Alert Bar */}
      {systemSettings.maintenanceMode && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between gap-4 text-red-400">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 shrink-0 text-red-400" />
            <div>
              <div className="font-bold text-sm">{t('admin.maintenanceOn')}</div>
              <div className="text-xs text-red-400/80">{t('admin.maintenanceNotice')}</div>
            </div>
          </div>
          <button
            onClick={handleToggleMaintenance}
            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer border-none shadow"
          >
            {t('admin.maintenanceOff')}
          </button>
        </div>
      )}

      {/* Embedded Sub-navigation Tabs (for Embedded or Mobile mode) */}
      {embedded && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-surface-border">
          <button
            onClick={() => setActiveNav('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-none shrink-0 ${
              activeNav === 'users' ? 'bg-copper-accent text-background shadow' : 'bg-surface-container text-sage-muted hover:text-on-background'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>{t('admin.navUsers')}</span>
          </button>

          <button
            onClick={() => setActiveNav('health')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-none shrink-0 ${
              activeNav === 'health' ? 'bg-copper-accent text-background shadow' : 'bg-surface-container text-sage-muted hover:text-on-background'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>{t('admin.navHealth')}</span>
          </button>

          <button
            onClick={() => setActiveNav('audit_logs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-none shrink-0 ${
              activeNav === 'audit_logs' ? 'bg-copper-accent text-background shadow' : 'bg-surface-container text-sage-muted hover:text-on-background'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>{t('admin.navAudit')}</span>
          </button>

          <button
            onClick={() => setActiveNav('allowlist')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-none shrink-0 ${
              activeNav === 'allowlist' ? 'bg-copper-accent text-background shadow' : 'bg-surface-container text-sage-muted hover:text-on-background'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{t('admin.navAllowlist')}</span>
          </button>

          <button
            onClick={() => setActiveNav('quota')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-none shrink-0 ${
              activeNav === 'quota' ? 'bg-copper-accent text-background shadow' : 'bg-surface-container text-sage-muted hover:text-on-background'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>{t('admin.navQuota')}</span>
          </button>
        </div>
      )}

      {/* Render Active View Content */}
      {activeNav === 'users' && (
        <div className="space-y-6">
          {/* Page Header & Access Control Pill */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-surface-container p-6 rounded-2xl border border-surface-border shadow-sm">
            <div>
              <h2 className="font-display-lg text-3xl font-bold text-on-background mb-2">{t('admin.title')}</h2>
              <p className="text-sage-muted text-sm max-w-2xl">{t('admin.subtitle')}</p>
            </div>

            <div className="flex items-center gap-1 bg-surface-container-high p-1 rounded-xl border border-surface-border">
              <button
                onClick={() => handleToggleAllowlistMode(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border-none ${
                  !systemSettings.allowlistMode
                    ? 'bg-copper-accent text-background shadow-sm'
                    : 'text-sage-muted hover:text-on-background bg-transparent'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{t('admin.openLogin')}</span>
              </button>

              <button
                onClick={() => handleToggleAllowlistMode(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border-none ${
                  systemSettings.allowlistMode
                    ? 'bg-copper-accent text-background shadow-sm'
                    : 'text-sage-muted hover:text-on-background bg-transparent'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{t('admin.restrictedLogin')}</span>
              </button>
            </div>
          </div>

          {/* Bento Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface-container p-5 rounded-xl border border-surface-border flex items-center justify-between shadow-sm">
              <div>
                <div className="text-sage-muted text-xs font-bold uppercase tracking-wider">{t('admin.totalUsers')}</div>
                <div className="text-2xl font-bold text-on-background mt-1">{users.length}</div>
              </div>
              <div className="p-3 rounded-xl bg-copper-accent/10 text-copper-accent">
                <Users className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-surface-container p-5 rounded-xl border border-surface-border flex items-center justify-between shadow-sm">
              <div>
                <div className="text-sage-muted text-xs font-bold uppercase tracking-wider">{t('admin.activeUsers')}</div>
                <div className="text-2xl font-bold text-on-background mt-1">
                  {users.filter((u) => u.status === 'active').length}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-400">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-surface-container p-5 rounded-xl border border-surface-border flex items-center justify-between shadow-sm">
              <div>
                <div className="text-sage-muted text-xs font-bold uppercase tracking-wider">{t('admin.blockedUsers')}</div>
                <div className="text-2xl font-bold text-on-background mt-1">
                  {users.filter((u) => u.status === 'blocked').length}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-red-500/15 text-red-400">
                <UserX className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-surface-container p-5 rounded-xl border border-surface-border flex items-center justify-between shadow-sm">
              <div>
                <div className="text-sage-muted text-xs font-bold uppercase tracking-wider">{t('admin.allowlistCount')}</div>
                <div className="text-2xl font-bold text-on-background mt-1">{allowlist.length}</div>
              </div>
              <div className="p-3 rounded-xl bg-copper-accent/15 text-copper-accent">
                <Lock className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* User Table Container */}
          <div className="bg-surface-container rounded-2xl border border-surface-border p-6 space-y-6 shadow-xl relative">
            {selectedUids.length > 0 && (
              <div className="bg-surface-container-high border border-copper-accent/50 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl animate-in fade-in duration-200">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-copper-accent text-background font-bold text-xs rounded-full font-mono">
                    {selectedUids.length}
                  </span>
                  <span className="text-sm font-semibold text-on-background">
                    {t('admin.selectedUsersCount', { count: selectedUids.length })}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <button
                    onClick={() => handleBulkBlock('blocked')}
                    className="px-3 py-1.5 bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>{t('admin.bulkBlock')}</span>
                  </button>

                  <button
                    onClick={() => handleBulkBlock('active')}
                    className="px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>{t('admin.bulkUnblock')}</span>
                  </button>

                  <button
                    onClick={handleBulkAddToAllowlist}
                    className="px-3 py-1.5 bg-surface-container border border-surface-border text-on-background hover:bg-surface-container-highest rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Lock className="w-3.5 h-3.5 text-copper-accent" />
                    <span>{t('admin.bulkAllowlist')}</span>
                  </button>

                  <button
                    onClick={handleOpenBulkPremiumModal}
                    className="px-3 py-1.5 bg-copper-accent hover:bg-copper-accent/90 text-background rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm border-none"
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>{t('admin.bulkPremium')}</span>
                  </button>

                  <button
                    onClick={() => setSelectedUids([])}
                    className="p-1.5 text-sage-muted hover:text-on-background rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                    title={t('admin.clearSelection')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="relative w-full md:w-80 flex items-center bg-surface-container-low rounded-full px-4 py-2 border border-surface-border focus-within:border-copper-accent/50 transition-colors shadow-sm">
                <Search className={`text-sage-muted shrink-0 w-4.5 h-4.5 ${isRtl ? 'ml-2' : 'mr-2'}`} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('admin.searchPlaceholder')}
                  dir="auto"
                  className="bg-transparent border-none focus:ring-0 text-sm text-on-background w-full placeholder-sage-muted outline-none pe-6"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className={`absolute p-1 rounded-full text-sage-muted hover:text-on-background hover:bg-surface-container-high transition-all cursor-pointer border-none bg-transparent ${
                      isRtl ? 'left-3' : 'right-3'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto justify-end flex-wrap">
                <div className="flex gap-1 bg-surface-container-low p-1 rounded-full border border-surface-border text-xs flex-wrap">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-full font-bold transition-all cursor-pointer border-none ${
                      statusFilter === 'all' ? 'bg-surface-container-high text-on-background shadow-sm' : 'text-sage-muted hover:text-on-background bg-transparent'
                    }`}
                  >
                    {t('admin.all')} ({users.length})
                  </button>

                  <button
                    onClick={() => setStatusFilter('active')}
                    className={`px-3 py-1.5 rounded-full font-bold transition-all cursor-pointer border-none ${
                      statusFilter === 'active' ? 'bg-surface-container-high text-on-background shadow-sm' : 'text-sage-muted hover:text-on-background bg-transparent'
                    }`}
                  >
                    {t('admin.active')} ({users.filter((u) => u.status === 'active').length})
                  </button>

                  <button
                    onClick={() => setStatusFilter('blocked')}
                    className={`px-3 py-1.5 rounded-full font-bold transition-all cursor-pointer border-none ${
                      statusFilter === 'blocked' ? 'bg-surface-container-high text-on-background shadow-sm' : 'text-sage-muted hover:text-on-background bg-transparent'
                    }`}
                  >
                    {t('admin.blocked')} ({users.filter((u) => u.status === 'blocked').length})
                  </button>

                  <button
                    onClick={() => setStatusFilter('allowlist')}
                    className={`px-3 py-1.5 rounded-full font-bold transition-all cursor-pointer border-none flex items-center gap-1 ${
                      statusFilter === 'allowlist' ? 'bg-copper-accent/20 text-copper-accent border border-copper-accent/30 shadow-sm' : 'text-sage-muted hover:text-on-background bg-transparent'
                    }`}
                  >
                    <Lock className="w-3 h-3 text-copper-accent" />
                    <span>{t('admin.allowlistOnly')} ({users.filter((u) => allowlistEmailsSet.has(u.email.toLowerCase())).length})</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-surface-border">
              <table className="w-full text-start border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-container-low/60 text-sage-muted text-xs uppercase font-bold tracking-wider">
                    <th className="py-3 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedUids.length === filteredUsers.length && filteredUsers.length > 0}
                        onChange={(e) => handleSelectAllUsers(e.target.checked)}
                        className="w-4 h-4 rounded border-surface-border text-copper-accent accent-copper-accent cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-4 font-bold text-start">{t('admin.user')}</th>
                    <th className="py-3 px-4 font-bold text-start">{t('admin.status')}</th>
                    <th className="py-3 px-4 font-bold text-start">{t('admin.plan')}</th>
                  </tr>
                </thead>

                <tbody className="text-sm">
                  {loadingUsers ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-sage-muted">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-6 h-6 border-2 border-copper-accent border-t-transparent rounded-full animate-spin" />
                          <span>{t('common.loading')}</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-sage-muted">
                        {t('admin.noUsersFound')}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const initials = (u.displayName || u.email || 'U')
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase();

                      const isUserBlocked = u.status === 'blocked';
                      const hasPremium = Boolean(u.premiumUntil && new Date(u.premiumUntil) > new Date());
                      const isSelected = selectedUids.includes(u.uid);
                      const isAllowlistedUser = allowlistEmailsSet.has(u.email.toLowerCase());

                      return (
                        <tr
                          key={u.uid}
                          className={`border-b border-surface-border/60 hover:bg-surface-container-high/40 transition-colors group ${
                            isSelected ? 'bg-surface-container-high/60' : ''
                          }`}
                        >
                          <td className="py-4 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleSelectUser(u.uid, e.target.checked)}
                              className="w-4 h-4 rounded border-surface-border text-copper-accent accent-copper-accent cursor-pointer"
                            />
                          </td>

                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-surface-container-high text-copper-accent flex items-center justify-center font-bold text-xs shrink-0 border border-surface-border">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <div className="text-on-background font-bold flex items-center gap-2">
                                  <span className="truncate">{u.displayName}</span>
                                  {u.role === 'admin' && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-copper-accent/20 text-copper-accent border border-copper-accent/30">
                                      ADMIN
                                    </span>
                                  )}
                                  {isAllowlistedUser && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5">
                                      <Lock className="w-2.5 h-2.5" /> ALLOWLISTED
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-sage-muted bidi-isolate font-mono truncate" dir="ltr">
                                  {u.email}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-4">
                            {isUserBlocked ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-mono font-bold uppercase">
                                <UserX className="w-3 h-3" /> {t('admin.blocked')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold uppercase">
                                <UserCheck className="w-3 h-3" /> {t('admin.active')}
                              </span>
                            )}
                          </td>

                          <td className="py-4 px-4">
                            {hasPremium ? (
                              <span className="text-copper-accent text-xs font-bold inline-flex items-center gap-1">
                                <Crown className="w-3.5 h-3.5 fill-copper-accent/20" />
                                {t('admin.premiumPlan')}
                                <span className="text-sage-muted font-normal text-[11px]">({t('admin.until')} {u.premiumUntil})</span>
                              </span>
                            ) : (
                              <span className="text-sage-muted text-xs">{t('admin.standardPlan')}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-xs text-sage-muted pt-2">
              <span>{t('admin.showingUsers', { shown: filteredUsers.length, total: users.length })}</span>
              {selectedUids.length > 0 && <span>{t('admin.selectedUsersCount', { count: selectedUids.length })}</span>}
            </div>
          </div>

          {/* Bulk Premium Plan Modal */}
          {isBulkPremiumModal && (
            <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-surface-container border border-surface-border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
                <div className="flex items-center gap-3 text-copper-accent">
                  <Crown className="w-6 h-6" />
                  <h3 className="text-lg font-bold text-on-background">{t('admin.bulkPremium')}</h3>
                </div>

                <p className="text-sm text-sage-muted">
                  {t('admin.selectedUsersCount', { count: selectedUids.length })}
                </p>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-sage-muted uppercase tracking-wider">{t('admin.premiumUntilLabel')}</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={premiumDate}
                      onChange={(e) => setPremiumDate(e.target.value)}
                      className="w-full bg-surface-container-low border border-surface-border rounded-xl px-4 py-2.5 text-on-background text-sm focus:border-copper-accent outline-none"
                    />
                    <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-sage-muted pointer-events-none" />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
                  <button
                    onClick={() => setIsBulkPremiumModal(false)}
                    className="px-4 py-2 text-sm font-bold text-sage-muted hover:text-on-background transition-colors cursor-pointer border-none bg-transparent"
                  >
                    {t('admin.cancel')}
                  </button>
                  <button
                    onClick={handleSaveBulkPremium}
                    className="px-5 py-2 text-sm font-bold bg-copper-accent hover:bg-copper-accent/90 text-background rounded-xl transition-all shadow cursor-pointer border-none"
                  >
                    {t('admin.savePlan')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Render System Health View */}
      {activeNav === 'health' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-container p-6 rounded-2xl border border-surface-border shadow-sm">
            <div>
              <h2 className="text-2xl font-bold font-serif text-on-background flex items-center gap-3">
                <Activity className="w-6 h-6 text-copper-accent" />
                <span>{t('admin.healthTitle')}</span>
              </h2>
              <p className="text-sage-muted text-sm mt-1">{t('admin.healthSubtitle')}</p>
            </div>
            <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live Telemetry</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="bg-surface-container rounded-2xl border border-surface-border p-6 md:col-span-8 flex flex-col justify-between shadow-lg">
              <div>
                <div className="flex justify-between items-center border-b border-surface-border pb-4 mb-6">
                  <h3 className="text-lg font-bold text-on-background flex items-center gap-2">
                    <Zap className="w-5 h-5 text-copper-accent" />
                    <span>{t('admin.processingCore')}</span>
                  </h3>
                  <span className="text-xs font-mono font-bold bg-copper-accent/15 text-copper-accent px-3 py-1 rounded-full border border-copper-accent/30">
                    WASM + ONNX Engine
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-sage-muted uppercase tracking-wider">{t('admin.photosIndexed')}</span>
                    <span className="text-3xl font-bold font-mono text-on-background">{healthMetrics.totalPhotos.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col gap-1 sm:border-s border-surface-border sm:ps-6">
                    <span className="text-xs font-bold text-sage-muted uppercase tracking-wider">{t('admin.detectedFaces')}</span>
                    <span className="text-3xl font-bold font-mono text-on-background">{healthMetrics.totalFaces.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col gap-1 sm:border-s border-surface-border sm:ps-6">
                    <span className="text-xs font-bold text-sage-muted uppercase tracking-wider">{t('admin.embeddingsCount')}</span>
                    <span className="text-3xl font-bold font-mono text-copper-accent">{healthMetrics.totalEmbeddings.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Sparkline Graph: Photos Indexed Over Time with Range Selector */}
              {(() => {
                const rawTimelines = healthMetrics.eventTimelines || [];
                const fallbackTimeline = healthMetrics.photosOverTime || [];
                const now = new Date();
                const currentTimestamp = now.getTime();

                let timeline: { date: string; count: number }[] = [];

                if (rawTimelines.length > 0) {
                  if (timeRange === '1d') {
                    for (let i = 5; i >= 0; i--) {
                      const targetTime = new Date(currentTimestamp - i * 4 * 60 * 60 * 1000);
                      const timeStr = targetTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                      const count = rawTimelines
                        .filter((e) => e.timestamp <= targetTime.getTime())
                        .reduce((sum, e) => sum + e.photoCount, 0);
                      timeline.push({ date: timeStr, count });
                    }
                  } else if (timeRange === '5d') {
                    for (let i = 4; i >= 0; i--) {
                      const d = new Date(now);
                      d.setDate(d.getDate() - i);
                      const dateStr = d.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', { month: 'numeric', day: 'numeric' });
                      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();
                      const count = rawTimelines
                        .filter((e) => e.timestamp <= dayEnd)
                        .reduce((sum, e) => sum + e.photoCount, 0);
                      timeline.push({ date: dateStr, count });
                    }
                  } else if (timeRange === '1m') {
                    for (let i = 5; i >= 0; i--) {
                      const d = new Date(now);
                      d.setDate(d.getDate() - i * 6);
                      const dateStr = d.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', { month: 'numeric', day: 'numeric' });
                      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();
                      const count = rawTimelines
                        .filter((e) => e.timestamp <= dayEnd)
                        .reduce((sum, e) => sum + e.photoCount, 0);
                      timeline.push({ date: dateStr, count });
                    }
                  } else if (timeRange === '6m') {
                    for (let i = 5; i >= 0; i--) {
                      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                      const monthStr = d.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', { month: 'short' });
                      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
                      const count = rawTimelines
                        .filter((e) => e.timestamp <= monthEnd)
                        .reduce((sum, e) => sum + e.photoCount, 0);
                      timeline.push({ date: monthStr, count });
                    }
                  } else if (timeRange === '1y') {
                    for (let i = 5; i >= 0; i--) {
                      const d = new Date(now.getFullYear(), now.getMonth() - i * 2, 1);
                      const monthStr = d.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', { month: 'short' });
                      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
                      const count = rawTimelines
                        .filter((e) => e.timestamp <= monthEnd)
                        .reduce((sum, e) => sum + e.photoCount, 0);
                      timeline.push({ date: monthStr, count });
                    }
                  } else {
                    const oldestTimestamp = rawTimelines.length > 0 ? Math.min(...rawTimelines.map((e) => e.timestamp)) : currentTimestamp - 30 * 86400000;
                    const timeSpan = currentTimestamp - oldestTimestamp || 86400000;
                    for (let i = 5; i >= 0; i--) {
                      const targetTime = oldestTimestamp + (timeSpan * (5 - i)) / 5;
                      const d = new Date(targetTime);
                      const dateStr = d.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', { month: 'numeric', day: 'numeric' });
                      const count = rawTimelines
                        .filter((e) => e.timestamp <= targetTime)
                        .reduce((sum, e) => sum + e.photoCount, 0);
                      timeline.push({ date: dateStr, count });
                    }
                  }
                } else {
                  timeline = fallbackTimeline;
                }

                const maxCount = Math.max(...timeline.map((t) => t.count), 10);
                const minCount = Math.min(...timeline.map((t) => t.count), 0);
                const range = maxCount - minCount || 1;

                const svgWidth = 600;
                const svgHeight = 100;

                const points = timeline.map((pt, index) => {
                  const x = timeline.length > 1 ? (index / (timeline.length - 1)) * (svgWidth - 40) + 20 : svgWidth / 2;
                  const y = svgHeight - 25 - ((pt.count - minCount) / range) * (svgHeight - 45);
                  return { x, y, date: pt.date, count: pt.count };
                });

                const pathD = points.length > 0 ? `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')}` : '';
                const areaD = points.length > 0
                  ? `M ${points[0].x},${svgHeight - 15} L ${points.map((p) => `${p.x},${p.y}`).join(' L ')} L ${points[points.length - 1].x},${svgHeight - 15} Z`
                  : '';

                return (
                  <div className="mt-8 pt-6 border-t border-surface-border space-y-4">
                    {/* Time Range Selector Bar (Matching Stock Chart UI) */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="flex items-center gap-1 text-xs font-bold font-mono border-b border-surface-border sm:border-b-0 pb-2 sm:pb-0 w-full sm:w-auto overflow-x-auto">
                        {(['1d', '5d', '1m', '6m', '1y', 'max'] as const).map((rangeKey) => {
                          const labels: Record<string, string> = {
                            '1d': '1D',
                            '5d': '5D',
                            '1m': '1M',
                            '6m': '6M',
                            '1y': '1Y',
                            max: 'MAX',
                          };
                          const isActive = timeRange === rangeKey;
                          return (
                            <button
                              key={rangeKey}
                              onClick={() => setTimeRange(rangeKey)}
                              className={`px-3 py-1 rounded-md transition-all cursor-pointer border-none relative text-xs font-mono font-bold ${
                                isActive
                                  ? 'text-copper-accent bg-copper-accent/15'
                                  : 'text-sage-muted hover:text-on-background bg-transparent'
                              }`}
                            >
                              <span>{labels[rangeKey]}</span>
                              {isActive && (
                                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-copper-accent rounded-full" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <span className="font-mono text-xs font-bold text-copper-accent shrink-0">
                        {healthMetrics.totalPhotos.toLocaleString()} {language === 'he' ? 'תמונות סה״כ' : 'Total Photos'}
                      </span>
                    </div>

                    {/* Chart Canvas */}
                    <div className="w-full relative overflow-hidden pt-2">
                      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-24 overflow-visible">
                        <defs>
                          <linearGradient id="photoGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#B87333" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#B87333" stopOpacity="0" />
                          </linearGradient>
                        </defs>

                        {/* Area Fill */}
                        {areaD && <path d={areaD} fill="url(#photoGrad)" />}

                        {/* Sparkline Curve */}
                        {pathD && (
                          <path
                            d={pathD}
                            fill="none"
                            stroke="#B87333"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}

                        {/* Points & Date Labels */}
                        {points.map((pt, i) => (
                          <g key={i}>
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r="4"
                              fill="#B87333"
                              stroke="#121815"
                              strokeWidth="2"
                            />
                            <text
                              x={pt.x}
                              y={svgHeight - 2}
                              textAnchor="middle"
                              fill="#8E9B94"
                              fontSize="10"
                              className="font-mono font-semibold"
                            >
                              {pt.date}
                            </text>
                          </g>
                        ))}
                      </svg>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="bg-surface-container rounded-2xl border border-surface-border p-6 md:col-span-4 flex flex-col justify-between shadow-lg">
              <h3 className="text-lg font-bold text-on-background border-b border-surface-border pb-4 mb-4 flex items-center gap-2">
                <Cloud className="w-5 h-5 text-copper-accent" />
                <span>{t('admin.storageFabric')}</span>
              </h3>

              <div className="flex flex-col items-center justify-center gap-4 py-2">
                <div
                  className="relative w-28 h-28 rounded-full flex items-center justify-center shadow-inner transition-all"
                  style={{
                    background: `conic-gradient(#B87333 0% ${healthMetrics.googleDrivePercent}%, #4C6358 ${healthMetrics.googleDrivePercent}% 100%)`,
                  }}
                >
                  <div className="absolute w-20 h-20 bg-surface-container rounded-full flex flex-col items-center justify-center border border-surface-border shadow-md">
                    <Cloud className="w-6 h-6 text-copper-accent" />
                  </div>
                </div>

                <div className="w-full space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-copper-accent" />
                      <span className="font-bold text-on-background">Google Drive</span>
                    </div>
                    <span className="font-mono text-sage-muted">{healthMetrics.googleDrivePercent}% ({healthMetrics.googleDriveCount})</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#4C6358]" />
                      <span className="font-bold text-on-background">Dropbox</span>
                    </div>
                    <span className="font-mono text-sage-muted">{healthMetrics.dropboxPercent}% ({healthMetrics.dropboxCount})</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface-container rounded-2xl border border-surface-border p-6 md:col-span-12 shadow-lg">
              <h3 className="text-lg font-bold text-on-background border-b border-surface-border pb-4 mb-6 flex items-center gap-2">
                <Radio className="w-5 h-5 text-copper-accent" />
                <span>{t('admin.eventTelemetry')}</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-surface-container-low p-4 rounded-xl border border-surface-border flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-copper-accent/15 text-copper-accent flex items-center justify-center shrink-0">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-sage-muted uppercase tracking-wider">{t('admin.activeEvents')}</div>
                    <div className="text-2xl font-bold font-mono text-on-background mt-0.5">{healthMetrics.activeEvents}</div>
                  </div>
                </div>

                <div className="bg-surface-container-low p-4 rounded-xl border border-surface-border flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                    <Radio className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-sage-muted uppercase tracking-wider">{t('admin.currentlyScanning')}</div>
                    <div className="text-2xl font-bold font-mono text-amber-400 mt-0.5">{healthMetrics.scanningEvents}</div>
                  </div>
                </div>

                <div className="bg-surface-container-low p-4 rounded-xl border border-surface-border flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-sage-muted uppercase tracking-wider">{t('admin.completedRuns')}</div>
                    <div className="text-2xl font-bold font-mono text-emerald-400 mt-0.5">{healthMetrics.completedEvents}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Render System Audit Logs View */}
      {activeNav === 'audit_logs' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-container p-6 rounded-2xl border border-surface-border shadow-sm">
            <div>
              <h2 className="text-2xl font-bold font-serif text-on-background flex items-center gap-3">
                <ShieldAlert className="w-6 h-6 text-copper-accent" />
                <span>{t('admin.auditTitle')}</span>
              </h2>
              <p className="text-sage-muted text-sm mt-1">{t('admin.auditSubtitle')}</p>
            </div>
          </div>

          <div className="bg-surface-container rounded-2xl border border-surface-border p-6 space-y-6 shadow-xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="relative w-full md:w-80 flex items-center bg-surface-container-low rounded-full px-4 py-2 border border-surface-border focus-within:border-copper-accent/50 transition-colors shadow-sm">
                <Search className={`text-sage-muted shrink-0 w-4.5 h-4.5 ${isRtl ? 'ml-2' : 'mr-2'}`} />
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="חיפוש יומנים..."
                  dir="auto"
                  className="bg-transparent border-none focus:ring-0 text-sm text-on-background w-full placeholder-sage-muted outline-none pe-6"
                />
                {auditSearch && (
                  <button
                    onClick={() => setAuditSearch('')}
                    className={`absolute p-1 rounded-full text-sage-muted hover:text-on-background hover:bg-surface-container-high transition-all cursor-pointer border-none bg-transparent ${
                      isRtl ? 'left-3' : 'right-3'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex gap-1 bg-surface-container-low p-1 rounded-full border border-surface-border text-xs flex-wrap">
                <button
                  onClick={() => setSeverityFilter('all')}
                  className={`px-3 py-1.5 rounded-full font-bold transition-all cursor-pointer border-none ${
                    severityFilter === 'all' ? 'bg-surface-container-high text-on-background shadow-sm' : 'text-sage-muted hover:text-on-background bg-transparent'
                  }`}
                >
                  {t('admin.allSeverities')} ({auditLogs.length})
                </button>
                <button
                  onClick={() => setSeverityFilter('info')}
                  className={`px-3 py-1.5 rounded-full font-bold transition-all cursor-pointer border-none ${
                    severityFilter === 'info' ? 'bg-surface-container-high text-on-background shadow-sm' : 'text-sage-muted hover:text-on-background bg-transparent'
                  }`}
                >
                  {t('admin.infoSeverity')} ({auditLogs.filter((l) => l.severity === 'info').length})
                </button>
                <button
                  onClick={() => setSeverityFilter('warning')}
                  className={`px-3 py-1.5 rounded-full font-bold transition-all cursor-pointer border-none ${
                    severityFilter === 'warning' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-sm' : 'text-sage-muted hover:text-on-background bg-transparent'
                  }`}
                >
                  {t('admin.warningSeverity')} ({auditLogs.filter((l) => l.severity === 'warning').length})
                </button>
                <button
                  onClick={() => setSeverityFilter('security')}
                  className={`px-3 py-1.5 rounded-full font-bold transition-all cursor-pointer border-none ${
                    severityFilter === 'security' ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-sm' : 'text-sage-muted hover:text-on-background bg-transparent'
                  }`}
                >
                  {t('admin.securitySeverity')} ({auditLogs.filter((l) => l.severity === 'security').length})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-surface-border">
              <table className="w-full text-start border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-container-low/60 text-sage-muted text-xs uppercase font-bold tracking-wider">
                    <th className="py-3 px-4 font-bold text-start">תאריך/שעה</th>
                    <th className="py-3 px-4 font-bold text-start">פעולה</th>
                    <th className="py-3 px-4 font-bold text-start">מבצע הפעולה</th>
                    <th className="py-3 px-4 font-bold text-start">דרגת חומרה</th>
                    <th className="py-3 px-4 font-bold text-start">פרטים</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {loadingAuditLogs ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-sage-muted">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-6 h-6 border-2 border-copper-accent border-t-transparent rounded-full animate-spin" />
                          <span>{t('common.loading')}</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-sage-muted">
                        {t('admin.noAuditLogs')}
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map((log, idx) => {
                      let timeStr = 'עתה';
                      if (log.timestamp && typeof log.timestamp === 'object' && 'toDate' in log.timestamp) {
                        timeStr = (log.timestamp as { toDate: () => Date }).toDate().toLocaleString(language === 'he' ? 'he-IL' : 'en-US');
                      }

                      const isWarning = log.severity === 'warning';
                      const isSecurity = log.severity === 'security';

                      return (
                        <tr key={log.id || `audit-${idx}`} className="border-b border-surface-border/60 hover:bg-surface-container-high/40 transition-colors">
                          <td className="py-3 px-4 text-xs font-mono text-sage-muted bidi-isolate">{timeStr}</td>
                          <td className="py-3 px-4 font-bold text-on-background font-mono text-xs">{log.action}</td>
                          <td className="py-3 px-4 text-xs font-mono text-sage-muted bidi-isolate" dir="ltr">{log.userEmail || log.performedBy}</td>
                          <td className="py-3 px-4">
                            {isSecurity ? (
                              <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold uppercase">
                                SECURITY
                              </span>
                            ) : isWarning ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold uppercase">
                                WARNING
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-sage-muted border border-surface-border text-[10px] font-bold uppercase">
                                INFO
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-on-background">
                            {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
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
      )}

      {/* Render Allowlist CSV View */}
      {activeNav === 'allowlist' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-container p-6 rounded-2xl border border-surface-border shadow-sm">
            <div>
              <h2 className="text-2xl font-bold font-serif text-on-background flex items-center gap-3">
                <FileSpreadsheet className="w-6 h-6 text-copper-accent" />
                <span>{t('admin.allowlistCsvTitle')}</span>
              </h2>
              <p className="text-sage-muted text-sm mt-1">{t('admin.allowlistCsvSubtitle')}</p>
            </div>

            <button
              onClick={() => exportAllowlistCsv(allowlist)}
              disabled={!allowlist.length}
              className="flex items-center gap-2 px-4 py-2 bg-copper-accent hover:bg-copper-accent/90 disabled:opacity-50 text-background font-bold rounded-xl transition-all text-xs cursor-pointer border-none shadow"
            >
              <Download className="w-4 h-4" />
              <span>{t('admin.exportCsvBtn')}</span>
            </button>
          </div>

          <div className="bg-surface-container rounded-2xl border border-surface-border p-6 space-y-6 shadow-xl">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              className="border-2 border-dashed border-surface-border hover:border-copper-accent/60 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-4 transition-colors cursor-pointer bg-surface-container-low/40 relative"
            >
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <div className="w-14 h-14 rounded-full bg-copper-accent/15 text-copper-accent flex items-center justify-center">
                <Upload className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-base font-bold text-on-background">{t('admin.dropCsvHere')}</h4>
                <p className="text-sage-muted text-xs mt-1">תומך בקבצי .csv או .txt עם כתובות אימייל בעברית/אנגלית</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-sage-muted uppercase tracking-wider">
                {t('admin.pasteEmailsPlaceholder')}
              </label>
              <textarea
                rows={4}
                value={rawCsvInput}
                onChange={(e) => setRawCsvInput(e.target.value)}
                placeholder="user1@example.com, user2@example.com, user3@domain.co.il"
                dir="ltr"
                className="w-full bg-surface-container-low border border-surface-border rounded-xl p-4 text-sm text-on-background font-mono focus:border-copper-accent outline-none"
              />
            </div>

            {parsedCsvEmails.length > 0 && (
              <div className="bg-surface-container-high border border-copper-accent/40 rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="text-sm font-bold text-on-background flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span>{t('admin.previewEmails', { count: parsedCsvEmails.length })}</span>
                </div>
                <button
                  onClick={handleImportParsedCsv}
                  className="px-5 py-2 bg-copper-accent hover:bg-copper-accent/90 text-background font-bold text-xs rounded-xl transition-all cursor-pointer border-none shadow"
                >
                  {t('admin.importEmailsBtn')}
                </button>
              </div>
            )}
          </div>

          <div className="bg-surface-container rounded-2xl border border-surface-border p-6 space-y-6 shadow-xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="relative w-full md:w-80 flex items-center bg-surface-container-low rounded-full px-4 py-2 border border-surface-border focus-within:border-copper-accent/50 transition-colors shadow-sm">
                <Search className={`text-sage-muted shrink-0 w-4.5 h-4.5 ${isRtl ? 'ml-2' : 'mr-2'}`} />
                <input
                  type="text"
                  value={allowlistSearch}
                  onChange={(e) => setAllowlistSearch(e.target.value)}
                  placeholder="חיפוש ברשימת מורשים..."
                  dir="auto"
                  className="bg-transparent border-none focus:ring-0 text-sm text-on-background w-full placeholder-sage-muted outline-none pe-6"
                />
                {allowlistSearch && (
                  <button
                    onClick={() => setAllowlistSearch('')}
                    className={`absolute p-1 rounded-full text-sage-muted hover:text-on-background hover:bg-surface-container-high transition-all cursor-pointer border-none bg-transparent ${
                      isRtl ? 'left-3' : 'right-3'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <span className="text-xs font-bold text-sage-muted font-mono">
                סה״כ {filteredAllowlistEntries.length} אימיילים מורשים
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-surface-border">
              <table className="w-full text-start border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-container-low/60 text-sage-muted text-xs uppercase font-bold tracking-wider">
                    <th className="py-3 px-4 font-bold text-start">כתובת אימייל מורשית</th>
                    <th className="py-3 px-4 font-bold text-start">נוסף על ידי</th>
                    <th className="py-3 px-4 font-bold text-center w-24">פעולות</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredAllowlistEntries.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-sage-muted">
                        אין כתובות ברשימת המורשים התואמות את החיפוש.
                      </td>
                    </tr>
                  ) : (
                    filteredAllowlistEntries.map((entry) => (
                      <tr key={entry.email} className="border-b border-surface-border/60 hover:bg-surface-container-high/40 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-on-background bidi-isolate" dir="ltr">{entry.email}</td>
                        <td className="py-3 px-4 text-xs text-sage-muted font-mono bidi-isolate">{entry.addedBy || 'מנהל'}</td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleSingleRemoveAllowlist(entry.email)}
                            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                            title={t('admin.removeFromAllowlist')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Render Quota Management View */}
      {activeNav === 'quota' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-container p-6 rounded-2xl border border-surface-border shadow-sm">
            <div>
              <h2 className="text-2xl font-bold font-serif text-on-background flex items-center gap-3">
                <Sliders className="w-6 h-6 text-copper-accent" />
                <span>{t('admin.quotaTitle')}</span>
              </h2>
              <p className="text-sage-muted text-sm mt-1">{t('admin.quotaSubtitle')}</p>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
              <Shield className="w-4 h-4" />
              <span>{t('admin.securityEnforcedBadge')}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-surface-container rounded-2xl border border-surface-border p-6 space-y-4 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-surface-border pb-3 mb-4">
                  <h3 className="text-lg font-bold text-on-background flex items-center gap-2">
                    <Users className="w-5 h-5 text-sage-muted" />
                    <span>{t('admin.standardTier')}</span>
                  </h3>
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-surface-container-high text-sage-muted border border-surface-border">
                    DEFAULT TIER
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-sage-muted uppercase tracking-wider">
                      {t('admin.maxPhotosPerMonth')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50000}
                      value={quotaForm.standard.maxPhotosPerMonth}
                      onChange={(e) =>
                        setQuotaForm((prev) => ({
                          ...prev,
                          standard: { ...prev.standard, maxPhotosPerMonth: parseInt(e.target.value, 10) || 500 },
                        }))
                      }
                      className="w-full bg-surface-container-low border border-surface-border rounded-xl px-4 py-2.5 text-on-background text-sm font-mono focus:border-copper-accent outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface-container rounded-2xl border border-surface-border p-6 space-y-4 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-surface-border pb-3 mb-4">
                  <h3 className="text-lg font-bold text-on-background flex items-center gap-2">
                    <Crown className="w-5 h-5 text-copper-accent" />
                    <span>{t('admin.premiumTier')}</span>
                  </h3>
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-copper-accent/20 text-copper-accent border border-copper-accent/30">
                    PRO UNLIMITED
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-sage-muted uppercase tracking-wider">
                      {t('admin.maxPhotosPerMonth')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={1000000}
                      value={quotaForm.premium.maxPhotosPerMonth}
                      onChange={(e) =>
                        setQuotaForm((prev) => ({
                          ...prev,
                          premium: { ...prev.premium, maxPhotosPerMonth: parseInt(e.target.value, 10) || 10000 },
                        }))
                      }
                      className="w-full bg-surface-container-low border border-surface-border rounded-xl px-4 py-2.5 text-on-background text-sm font-mono focus:border-copper-accent outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={handleSaveQuotas}
              disabled={savingQuotas}
              className="px-6 py-3 bg-copper-accent hover:bg-copper-accent/90 disabled:opacity-50 text-background font-bold rounded-xl transition-all shadow cursor-pointer border-none text-sm flex items-center gap-2"
            >
              {savingQuotas ? (
                <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sliders className="w-4 h-4" />
              )}
              <span>{t('admin.saveQuotasBtn')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // If embedded in main screen (Dashboard), return canvas content
  if (embedded) {
    return mainCanvasContent;
  }

  // Standalone Layout with Side Navigation Bar
  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen bg-background text-on-background font-sans flex transition-colors duration-300">
      {/* Side Navigation Bar */}
      <aside
        className={`w-72 bg-surface-container h-screen fixed top-0 border-r border-surface-border py-6 px-4 flex flex-col z-40 hidden md:flex ${
          isRtl ? 'right-0 border-l border-r-0' : 'left-0 border-r border-l-0'
        }`}
      >
        {/* Sidebar Header */}
        <div className="mb-8 px-3">
          <h1 className="font-serif text-2xl font-semibold text-on-background tracking-tight">EventTag Admin</h1>
          <p className="text-sage-muted text-xs mt-1 font-mono uppercase tracking-widest">System Administrator</p>
        </div>

        {/* Sidebar Menu with 5 Active Tool Buttons */}
        <nav className="flex-1 space-y-1.5">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sage-muted hover:text-on-background hover:bg-surface-container-high transition-colors text-xs font-bold uppercase tracking-wider cursor-pointer border-none bg-transparent"
          >
            <LayoutDashboard className="w-4 h-4 text-sage-muted" />
            <span>{t('admin.backToDashboard')}</span>
          </button>

          {/* Button 1: User Management */}
          <button
            onClick={() => setActiveNav('users')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-none ${
              activeNav === 'users'
                ? 'text-copper-accent bg-surface-container-high border-s-4 border-copper-accent'
                : 'text-sage-muted hover:text-on-background hover:bg-surface-container-high bg-transparent'
            }`}
          >
            <Users className="w-4 h-4 text-copper-accent" />
            <span>{t('admin.navUsers')}</span>
          </button>

          {/* Button 2: System Health */}
          <button
            onClick={() => setActiveNav('health')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-none ${
              activeNav === 'health'
                ? 'text-copper-accent bg-surface-container-high border-s-4 border-copper-accent'
                : 'text-sage-muted hover:text-on-background hover:bg-surface-container-high bg-transparent'
            }`}
          >
            <Activity className="w-4 h-4 text-copper-accent" />
            <span>{t('admin.navHealth')}</span>
          </button>

          {/* Button 3: Audit Logs */}
          <button
            onClick={() => setActiveNav('audit_logs')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-none ${
              activeNav === 'audit_logs'
                ? 'text-copper-accent bg-surface-container-high border-s-4 border-copper-accent'
                : 'text-sage-muted hover:text-on-background hover:bg-surface-container-high bg-transparent'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-copper-accent" />
            <span>{t('admin.navAudit')}</span>
          </button>

          {/* Button 4: Allowlist CSV */}
          <button
            onClick={() => setActiveNav('allowlist')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-none ${
              activeNav === 'allowlist'
                ? 'text-copper-accent bg-surface-container-high border-s-4 border-copper-accent'
                : 'text-sage-muted hover:text-on-background hover:bg-surface-container-high bg-transparent'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-copper-accent" />
            <span>{t('admin.navAllowlist')}</span>
          </button>

          {/* Button 5: Quota Management */}
          <button
            onClick={() => setActiveNav('quota')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-none ${
              activeNav === 'quota'
                ? 'text-copper-accent bg-surface-container-high border-s-4 border-copper-accent'
                : 'text-sage-muted hover:text-on-background hover:bg-surface-container-high bg-transparent'
            }`}
          >
            <Sliders className="w-4 h-4 text-copper-accent" />
            <span>{t('admin.navQuota')}</span>
          </button>
        </nav>

        {/* Maintenance Toggle Button in Sidebar */}
        <div className="mt-auto pt-4 border-t border-surface-border space-y-3">
          <button
            onClick={handleToggleMaintenance}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
              systemSettings.maintenanceMode
                ? 'bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25'
                : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
            }`}
          >
            <span>{systemSettings.maintenanceMode ? t('admin.maintenanceOn') : t('admin.maintenanceOff')}</span>
            <Power className="w-4 h-4" />
          </button>

          <div className="flex items-center justify-between text-xs text-sage-muted pt-2 px-1">
            <button onClick={() => navigate('/dashboard')} className="hover:text-on-background flex items-center gap-1 cursor-pointer border-none bg-transparent">
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
            <button onClick={() => navigate('/faq')} className="hover:text-on-background flex items-center gap-1 cursor-pointer border-none bg-transparent">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Support</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-h-screen ${isRtl ? 'md:mr-72' : 'md:ml-72'}`}>
        {/* Top App Bar */}
        <header className="bg-background/90 backdrop-blur-md border-b border-surface-border sticky top-0 z-30 h-[72px] px-6 md:px-10 flex justify-between items-center w-full">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 rounded-lg hover:bg-surface-container text-sage-muted hover:text-on-background transition-colors flex items-center gap-2 text-xs font-bold cursor-pointer border-none bg-transparent"
            >
              <ArrowRight className="w-4 h-4" />
              <span>{t('admin.backToDashboard')}</span>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 border-s border-surface-border ps-4">
              <div className="w-9 h-9 rounded-full bg-surface-container-high border border-surface-border flex items-center justify-center text-copper-accent font-mono text-xs font-bold">
                {user?.email?.slice(0, 2).toUpperCase() || 'AD'}
              </div>
              <div className="hidden sm:block text-start">
                <div className="text-xs font-bold text-on-background">{user?.displayName || 'Admin User'}</div>
                <div className="text-[10px] text-sage-muted font-mono bidi-isolate" dir="ltr">{user?.email}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Canvas */}
        <main className="flex-1 p-6 md:p-10 max-w-6xl w-full mx-auto">
          {mainCanvasContent}
        </main>
      </div>
    </div>
  );
}
