import { useState, useEffect, useMemo } from 'react';
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
  History,
  Settings,
  HelpCircle,
  X,
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
  type UserProfile,
} from '../services/adminService';

interface AdminManagementProps {
  embedded?: boolean;
}

export function AdminManagement({ embedded = false }: AdminManagementProps) {
  const { user, isAdmin, systemSettings, allowlist } = useAuth();
  const { confirm, alert } = useModal();
  const { t, isRtl, language } = useTranslation();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked' | 'allowlist'>('all');
  const [activeNav, setActiveNav] = useState<'users' | 'allowlist'>('users');

  // Multi-select batch state
  const [selectedUids, setSelectedUids] = useState<string[]>([]);

  // Modals state
  const [isBulkPremiumModal, setIsBulkPremiumModal] = useState(false);
  const [premiumDate, setPremiumDate] = useState('');

  // Subscribe to all users
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

  // Fast set of allowlisted email strings (lowercase)
  const allowlistEmailsSet = useMemo(() => {
    return new Set(allowlist.map((a) => a.email.toLowerCase()));
  }, [allowlist]);

  // Filtered users by email search, status, or allowlist inclusion
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

  // Select all / deselect all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedUids(filteredUsers.map((u) => u.uid));
    } else {
      setSelectedUids([]);
    }
  };

  // Toggle single user row selection
  const handleSelectUser = (uid: string, checked: boolean) => {
    if (checked) {
      setSelectedUids((prev) => [...prev, uid]);
    } else {
      setSelectedUids((prev) => prev.filter((id) => id !== uid));
    }
  };

  // Access Denied Screen
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
        await updateSystemSettings({ maintenanceMode: nextState }, user.uid);
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
      await updateSystemSettings({ allowlistMode: enableRestricted }, user.uid);
    } catch (err) {
      console.error('Failed to update allowlist mode:', err);
      alert({ title: t('common.error'), message: 'Failed to update access mode.' });
    }
  };

  // ---- BULK ACTIONS ----
  const handleBulkBlock = async (status: 'active' | 'blocked') => {
    if (!selectedUids.length) return;
    const isBlocking = status === 'blocked';
    const confirmed = await confirm({
      title: isBlocking ? t('admin.bulkBlock') : t('admin.bulkUnblock'),
      message: isBlocking ? t('admin.confirmBlock') : t('admin.confirmUnblock'),
      confirmText: isBlocking ? t('admin.blockUser') : t('admin.unblockUser'),
      variant: isBlocking ? 'danger' : 'info',
    });

    if (confirmed) {
      try {
        await bulkUpdateUserStatus(selectedUids, status);
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
        await bulkAddToAllowlist(emails, user.uid);
        setSelectedUids([]);
      } catch (err) {
        console.error('Failed bulk allowlist add:', err);
        alert({ title: t('common.error'), message: 'Failed bulk allowlist add.' });
      }
    }
  };

  // Open Bulk Premium Modal
  const handleOpenBulkPremiumModal = () => {
    setIsBulkPremiumModal(true);
    setPremiumDate('');
  };

  // Save Bulk Premium Plan
  const handleSaveBulkPremium = async () => {
    if (!selectedUids.length) return;
    try {
      await bulkUpdateUserPremium(selectedUids, premiumDate || null);
      setIsBulkPremiumModal(false);
      setSelectedUids([]);
    } catch (err) {
      console.error('Failed bulk premium update:', err);
      alert({ title: t('common.error'), message: 'Failed bulk premium update.' });
    }
  };

  // Main Canvas Content
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

      {/* Page Header & Access Control Pill */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-surface-container p-6 rounded-2xl border border-surface-border shadow-sm">
        <div>
          <h2 className="font-display-lg text-3xl font-bold text-on-background mb-2">{t('admin.title')}</h2>
          <p className="text-sage-muted text-sm max-w-2xl">{t('admin.subtitle')}</p>
        </div>

        {/* Open vs Restricted Login Selector */}
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
        {/* Stat 1: Total Users */}
        <div className="bg-surface-container p-5 rounded-xl border border-surface-border flex items-center justify-between shadow-sm">
          <div>
            <div className="text-sage-muted text-xs font-bold uppercase tracking-wider">{t('admin.totalUsers')}</div>
            <div className="text-2xl font-bold text-on-background mt-1">{users.length}</div>
          </div>
          <div className="p-3 rounded-xl bg-copper-accent/10 text-copper-accent">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Stat 2: Active Users */}
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

        {/* Stat 3: Blocked Users */}
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

        {/* Stat 4: Allowlist Count (STATIC DISPLAY ONLY - Non Clickable) */}
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

      {/* Main Data Table Container */}
      <div className="bg-surface-container rounded-2xl border border-surface-border p-6 space-y-6 shadow-xl relative">
        {/* Bulk Action Bar (Displayed when 1 or more users selected) */}
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

        {/* Toolbar with Match Site Search Bar Style */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          {/* Site-matching Rounded Pill Search Input */}
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
                title={language === 'he' ? 'נקה חיפוש' : 'Clear search'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Pills & Actions (Includes Allowlist Filter) */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end flex-wrap">
            <div className="flex gap-1 bg-surface-container-low p-1 rounded-full border border-surface-border text-xs flex-wrap">
              {/* Filter 1: All */}
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-full font-bold transition-all cursor-pointer border-none ${
                  statusFilter === 'all' ? 'bg-surface-container-high text-on-background shadow-sm' : 'text-sage-muted hover:text-on-background bg-transparent'
                }`}
              >
                {t('admin.all')} ({users.length})
              </button>

              {/* Filter 2: Active */}
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1.5 rounded-full font-bold transition-all cursor-pointer border-none ${
                  statusFilter === 'active' ? 'bg-surface-container-high text-on-background shadow-sm' : 'text-sage-muted hover:text-on-background bg-transparent'
                }`}
              >
                {t('admin.active')} ({users.filter((u) => u.status === 'active').length})
              </button>

              {/* Filter 3: Blocked */}
              <button
                onClick={() => setStatusFilter('blocked')}
                className={`px-3 py-1.5 rounded-full font-bold transition-all cursor-pointer border-none ${
                  statusFilter === 'blocked' ? 'bg-surface-container-high text-on-background shadow-sm' : 'text-sage-muted hover:text-on-background bg-transparent'
                }`}
              >
                {t('admin.blocked')} ({users.filter((u) => u.status === 'blocked').length})
              </button>

              {/* Filter 4: Allowlist Only */}
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

        {/* Table (Actions Column Removed as Requested) */}
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-start border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-surface-border bg-surface-container-low/60 text-sage-muted text-xs uppercase font-bold tracking-wider">
                <th className="py-3 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      selectedUids.length === filteredUsers.length &&
                      filteredUsers.length > 0
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
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
                      {/* Checkbox Column */}
                      <td className="py-4 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectUser(u.uid, e.target.checked)}
                          className="w-4 h-4 rounded border-surface-border text-copper-accent accent-copper-accent cursor-pointer"
                        />
                      </td>

                      {/* User Column */}
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

                      {/* Status Badge */}
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

                      {/* Plan */}
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

        {/* Summary */}
        <div className="flex items-center justify-between text-xs text-sage-muted pt-2">
          <span>{t('admin.showingUsers', { shown: filteredUsers.length, total: users.length })}</span>
          {selectedUids.length > 0 && <span>{t('admin.selectedUsersCount', { count: selectedUids.length })}</span>}
        </div>
      </div>

      {/* ---- Bulk Premium Plan Modal ---- */}
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
  );

  // If embedded in main screen (Dashboard), return canvas content without duplicate sidebar/header
  if (embedded) {
    return mainCanvasContent;
  }

  // Standalone Layout (If accessed via route directly)
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

        {/* Sidebar Menu */}
        <nav className="flex-1 space-y-1.5">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sage-muted hover:text-on-background hover:bg-surface-container-high transition-colors text-xs font-bold uppercase tracking-wider cursor-pointer border-none bg-transparent"
          >
            <LayoutDashboard className="w-4 h-4 text-sage-muted" />
            <span>{t('admin.backToDashboard')}</span>
          </button>

          <button
            onClick={() => setActiveNav('users')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-none ${
              activeNav === 'users'
                ? 'text-copper-accent bg-surface-container-high border-s-4 border-copper-accent'
                : 'text-sage-muted hover:text-on-background hover:bg-surface-container-high bg-transparent'
            }`}
          >
            <Users className="w-4 h-4 text-copper-accent" />
            <span>{t('admin.title')}</span>
          </button>

          <button
            disabled
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sage-muted/50 text-xs font-bold uppercase tracking-wider cursor-not-allowed opacity-60 border-none bg-transparent"
          >
            <History className="w-4 h-4" />
            <span>System Logs</span>
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
