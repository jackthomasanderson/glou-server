'use client';

import React, { useState, useEffect } from 'react';
import { Button, Input, Select, SelectItem, CircularProgress } from '@heroui/react';
import { User, Settings, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { MainLayout } from '@/components/ui/MainLayout';
import { TwoFactorSettings } from '@/components/profile/TwoFactorSettings';
import { useMe, useUpdateProfile, useUpdatePreferences } from '@/hooks/useAuth';
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

export default function ProfilePage() {
  const { t } = useTranslation();
  const { data: user, isLoading: isLoadingUser } = useMe();
  const updateProfile = useUpdateProfile();
  const updatePrefs = useUpdatePreferences();

  const [profileData, setProfileData] = useState({ avatarUrl: '', appName: '', appSlogan: '' });
  const [prefsData, setPrefsData] = useState({
    theme: 'LIGHT' as 'LIGHT' | 'DARK',
    language: 'FR' as 'FR' | 'EN',
    tempUnit: 'CELSIUS' as 'CELSIUS' | 'FAHRENHEIT',
    dateFormat: 'SYSTEM' as 'SYSTEM' | 'H24' | 'H12',
    accentColor: '#6366f1',
  });
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setProfileData({ avatarUrl: user.avatarUrl || '', appName: user.appName || '', appSlogan: user.appSlogan || '' });
      setPrefsData({
        theme: user.theme || 'LIGHT',
        language: user.language || 'FR',
        tempUnit: user.tempUnit || 'CELSIUS',
        dateFormat: user.dateFormat || 'SYSTEM',
        accentColor: user.accentColor || '#6366f1',
      });
    }
  }, [user]);

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(profileData, {
      onSuccess: () => { setSuccessMsg(t('profile.saveSuccess')); setTimeout(() => setSuccessMsg(null), 3000); },
    });
  };

  const handlePrefsChange = (field: string, value: string) => {
    const newPrefs = { ...prefsData, [field]: value };
    setPrefsData(newPrefs);
    updatePrefs.mutate(newPrefs, {
      onSuccess: () => { setSuccessMsg(t('profile.saveSuccess')); setTimeout(() => setSuccessMsg(null), 3000); },
    });
  };

  if (isLoadingUser) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[50vh]">
          <CircularProgress isIndeterminate color="primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">{t('profile.title')}</h1>

        {successMsg && (
          <div className="bg-success-50 border border-success-200 text-success text-sm rounded-xl px-4 py-3 mb-5">{successMsg}</div>
        )}

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
                  {user.isAdmin ? 'Admin' : 'Utilisateur'}
                </span>
              )}
            </div>

            {user && <AvatarUploader user={user} />}

            <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4 mt-2">
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
                <SelectItem key="LIGHT">Clair / Light</SelectItem>
                <SelectItem key="DARK">Sombre / Dark</SelectItem>
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
            </div>

            <div className="mt-6 p-3 bg-default-50 rounded-xl">
              <p className="text-xs text-foreground-400">
                Les changements de thème et de langue s&apos;appliquent instantanément et sont sauvegardés sur votre compte.
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
              Accéder au panneau d&apos;administration
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
        <div className="mt-6">
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
      </div>
    </MainLayout>
  );
}
