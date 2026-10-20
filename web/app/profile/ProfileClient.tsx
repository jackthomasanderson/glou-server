'use client';

import React, { useState } from 'react';
import { Button, Input, Select, SelectItem, Switch, CircularProgress } from '@heroui/react';
import { User, Settings, ShieldCheck, Compass, Gift, FlaskConical, LogOut } from 'lucide-react';
import Link from 'next/link';
import { MainLayout } from '@/components/ui/MainLayout';
import { TwoFactorSettings } from '@/components/profile/TwoFactorSettings';
import { useMe, useLogout, useUpdateProfile, useUpdatePreferences } from '@/hooks/useAuth';
import { notifySuccess } from '@/lib/toast';
import { useTranslation } from 'react-i18next';
import { AccountSecurity } from '@/components/profile/AccountSecurity';
import { SessionsPanel } from '@/components/profile/SessionsPanel';
import { AvatarUploader } from '@/components/profile/AvatarUploader';
import { GdprSection } from '@/components/profile/GdprSection';
import { SharesDashboard } from '@/components/shares/SharesDashboard';
import { NotificationPreferences } from '@/components/profile/NotificationPreferences';

const ACCENT_COLORS = [
  { name: 'indigo', val: '#6366f1' },
  { name: 'rose', val: '#f43f5e' },
  { name: 'amber', val: '#f59e0b' },
  { name: 'emerald', val: '#10b981' },
  { name: 'cyan', val: '#06b6d4' },
  { name: 'violet', val: '#8b5cf6' },
];

export function ProfileClient() {
  const { t } = useTranslation();
  const { data: user, isLoading: isLoadingUser } = useMe();
  const logout = useLogout();
  const updateProfile = useUpdateProfile();
  const updatePrefs = useUpdatePreferences();

  const [profileData, setProfileData] = useState({ avatarUrl: '', displayName: '', appName: '', appSlogan: '' });
  const [prefsData, setPrefsData] = useState({
    theme: 'LIGHT' as 'LIGHT' | 'DARK',
    language: 'FR' as 'FR' | 'EN',
    tempUnit: 'CELSIUS' as 'CELSIUS' | 'FAHRENHEIT',
    dateFormat: 'SYSTEM' as 'SYSTEM' | 'H24' | 'H12',
    accentColor: '#6366f1',
    expertMode: false,
  });
  // Seeding form state once the user loads is adjusted during render
  // (React's documented pattern) rather than in an effect, guarded against
  // the previous render's user so it only fires when the fetched user
  // reference actually changes.
  const [prevUser, setPrevUser] = useState(user);
  if (user !== prevUser) {
    setPrevUser(user);
    if (user) {
      setProfileData({ avatarUrl: user.avatarUrl || '', displayName: user.displayName || '', appName: user.appName || '', appSlogan: user.appSlogan || '' });
      setPrefsData({
        theme: user.theme || 'LIGHT',
        language: user.language || 'FR',
        tempUnit: user.tempUnit || 'CELSIUS',
        dateFormat: user.dateFormat || 'SYSTEM',
        accentColor: user.accentColor || '#6366f1',
        expertMode: user.expertMode ?? false,
      });
    }
  }

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(profileData, {
      onSuccess: () => notifySuccess('profile.saveSuccess'),
    });
  };

  const handlePrefsChange = (field: string, value: string) => {
    const newPrefs = { ...prefsData, [field]: value };
    setPrefsData(newPrefs);
    updatePrefs.mutate(newPrefs, {
      onSuccess: () => notifySuccess('profile.saveSuccess'),
    });
  };

  const handleExpertModeChange = (value: boolean) => {
    const newPrefs = { ...prefsData, expertMode: value };
    setPrefsData(newPrefs);
    updatePrefs.mutate(newPrefs, {
      onSuccess: () => notifySuccess('profile.saveSuccess'),
    });
  };

  if (isLoadingUser) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[50vh]" role="status" aria-live="polite">
          <CircularProgress isIndeterminate color="primary" aria-label={t('status.loading')} />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">{t('profile.title')}</h1>

        {/* Wishlist & Budget (FEAT-20) — personal per-user feature, not part of
            the fixed sidebar nav (ux-ui.md 3.1's 6-item list is normative),
            so it's surfaced here instead, same treatment as the admin panel
            shortcut below. */}
        <Button
          as={Link}
          href="/wishlist-budget"
          color="primary"
          variant="bordered"
          startContent={<Gift size={16} />}
          radius="md"
          fullWidth
          className="mb-6"
        >
          {t('wishlist.pageAccess')}
        </Button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Personal Info */}
          <div className="bg-content1 border border-divider rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <User size={18} className="text-primary" />
                <h2 className="text-base font-semibold">{t('profile.personalInfo')}</h2>
              </div>
              {user && (
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${user.isAdmin ? 'bg-primary text-white' : 'bg-default-100 text-foreground-500 border border-divider'}`}>
                  {user.isAdmin ? t('nav.roleAdmin') : t('nav.roleUser')}
                </span>
              )}
            </div>

            {user && <AvatarUploader user={user} />}

            <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4 mt-2">
              <Input
                label={t('auth.displayName')}
                value={profileData.displayName}
                onValueChange={(v) => setProfileData(prev => ({ ...prev, displayName: v }))}
                maxLength={60}
                variant="bordered" size="sm" radius="md" labelPlacement="outside"
              />
              <Input
                label={t('profile.appName')}
                value={profileData.appName}
                onValueChange={(v) => setProfileData(prev => ({ ...prev, appName: v }))}
                placeholder={t('profile.appNamePlaceholder')}
                variant="bordered" size="sm" radius="md" labelPlacement="outside"
              />
              <Input
                label={t('profile.appSlogan')}
                value={profileData.appSlogan}
                onValueChange={(v) => setProfileData(prev => ({ ...prev, appSlogan: v }))}
                placeholder={t('profile.appSloganPlaceholder')}
                variant="bordered" size="sm" radius="md" labelPlacement="outside"
              />
              <Button
                type="submit" color="primary" variant="solid" size="md" radius="md" fullWidth
                isLoading={updateProfile.isPending} isDisabled={updateProfile.isPending}
                className="mt-1"
              >
                {t('actions.save')}
              </Button>
            </form>

            <Button
              as={Link}
              href="/profile?onboarding=1"
              variant="light"
              color="primary"
              size="sm"
              radius="md"
              fullWidth
              startContent={<Compass size={16} />}
              className="mt-3"
            >
              {t('profile.reviewOnboarding')}
            </Button>
          </div>

          {/* Preferences */}
          <div className="bg-content1 border border-divider rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <Settings size={18} className="text-primary" />
              <h2 className="text-base font-semibold">{t('profile.preferences')}</h2>
            </div>

            <div className="flex flex-col gap-4">
              <Select
                label={t('profile.theme')}
                selectedKeys={[prefsData.theme]}
                onSelectionChange={(keys) => handlePrefsChange('theme', Array.from(keys)[0] as string)}
                variant="bordered" size="sm" radius="md" labelPlacement="outside"
              >
                <SelectItem key="LIGHT">{t('profile.themes.LIGHT')}</SelectItem>
                <SelectItem key="DARK">{t('profile.themes.DARK')}</SelectItem>
              </Select>

              <Select
                label={t('profile.language')}
                selectedKeys={[prefsData.language]}
                onSelectionChange={(keys) => handlePrefsChange('language', Array.from(keys)[0] as string)}
                variant="bordered" size="sm" radius="md" labelPlacement="outside"
              >
                <SelectItem key="FR">Français</SelectItem>
                <SelectItem key="EN">English</SelectItem>
              </Select>

              <Select
                label={t('profile.tempUnit')}
                selectedKeys={[prefsData.tempUnit]}
                onSelectionChange={(keys) => handlePrefsChange('tempUnit', Array.from(keys)[0] as string)}
                variant="bordered" size="sm" radius="md" labelPlacement="outside"
              >
                <SelectItem key="CELSIUS">°Celsius</SelectItem>
                <SelectItem key="FAHRENHEIT">°Fahrenheit</SelectItem>
              </Select>

              <Select
                label={t('profile.dateFormat')}
                selectedKeys={[prefsData.dateFormat]}
                onSelectionChange={(keys) => handlePrefsChange('dateFormat', Array.from(keys)[0] as string)}
                variant="bordered" size="sm" radius="md" labelPlacement="outside"
              >
                <SelectItem key="SYSTEM">{t('profile.dateFormats.SYSTEM')}</SelectItem>
                <SelectItem key="H24">{t('profile.dateFormats.H24')}</SelectItem>
                <SelectItem key="H12">{t('profile.dateFormats.H12')}</SelectItem>
              </Select>

              <div>
                <p className="text-xs text-foreground-500 mb-2">{t('profile.accentColor')}</p>
                <div className="flex gap-3 flex-wrap">
                  {ACCENT_COLORS.map((c) => (
                    <button
                      key={c.val}
                      type="button"
                      title={t(`profile.colors.${c.name}`)}
                      aria-label={t(`profile.colors.${c.name}`)}
                      aria-pressed={prefsData.accentColor === c.val}
                      onClick={() => handlePrefsChange('accentColor', c.val)}
                      className="w-8 h-8 rounded-full transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c.val,
                        border: prefsData.accentColor === c.val ? '3px solid #1F1F1F' : '3px solid transparent',
                        outline: prefsData.accentColor === c.val ? '2px solid white' : 'none',
                        outlineOffset: '-4px',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Mode expert / collectionneur (data-model audit) */}
              <div className="flex items-start justify-between gap-3 pt-4 border-t border-divider">
                <div className="flex items-start gap-2">
                  <FlaskConical size={16} className="text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{t('profile.expertMode.title')}</p>
                    <p className="text-xs text-foreground-400">{t('profile.expertMode.description')}</p>
                  </div>
                </div>
                <Switch
                  isSelected={prefsData.expertMode}
                  onValueChange={handleExpertModeChange}
                  size="sm"
                  aria-label={t('profile.expertMode.title')}
                />
              </div>
            </div>

            <div className="mt-6 p-3 bg-default-50 rounded-xl">
              <p className="text-xs text-foreground-400">
                {t('profile.preferencesHint')}
              </p>
            </div>
          </div>
        </div>

        {/* Admin panel shortcut */}
        {user?.isAdmin && (
          <div className="mt-6">
            <Button
              as={Link}
              href="/admin"
              color="primary"
              variant="bordered"
              startContent={<ShieldCheck size={16} />}
              radius="md"
              fullWidth
            >
              {t('profile.adminPanelLink')}
            </Button>
          </div>
        )}

        {/* Security sections */}
        {user && (
          <div id="security" className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 scroll-mt-24">
            <AccountSecurity user={user} />
            <TwoFactorSettings user={user} />
            <SessionsPanel />
          </div>
        )}

        {/* Guest shares */}
        <div id="shares" className="mt-6 scroll-mt-24">
          <SharesDashboard />
        </div>

        {/* Notifications */}
        <div className="mt-6">
          <NotificationPreferences />
        </div>

        {/* RGPD */}
        {user && (
          <div className="mt-6">
            <GdprSection user={user} />
          </div>
        )}

        <div className="mt-6">
          <Button
            color="danger"
            variant="flat"
            startContent={<LogOut size={16} />}
            radius="md"
            fullWidth
            isLoading={logout.isPending}
            onPress={() => logout.mutate()}
          >
            {t('auth.logout')}
          </Button>
        </div>
      </div>
    </MainLayout>
  );
}
