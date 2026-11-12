'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button, Input, SelectItem, Switch, CircularProgress } from '@heroui/react';
import { User, Settings, ShieldCheck, Compass, FlaskConical, LogOut } from 'lucide-react';
import Link from 'next/link';
import { MainLayout } from '@/components/ui/MainLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMe, useLogout, useUpdateProfile, useUpdatePreferences } from '@/hooks/useAuth';
import { notifySuccess } from '@/lib/toast';
import { useTranslation } from 'react-i18next';
import { AccountSecurity } from '@/components/profile/AccountSecurity';
import { SessionsPanel } from '@/components/profile/SessionsPanel';
import { AvatarUploader } from '@/components/profile/AvatarUploader';
import { GdprSection } from '@/components/profile/GdprSection';
import { SharesDashboard } from '@/components/shares/SharesDashboard';
import { NotificationPreferences } from '@/components/profile/NotificationPreferences';
import { AppVersion } from '@/components/profile/AppVersion';
import { SingleSelect } from '@/components/ui/SingleSelect';
import { ACCENT_PRESETS, DEFAULT_ACCENT, resolveAccentPreset } from '@/lib/theme-colors';

// #648: the presets and their contrast checks live in lib/theme-colors.ts.
const ACCENT_COLORS = ACCENT_PRESETS.map((p) => ({ name: p.name, val: p.light.DEFAULT }));

const SECTION_IDS = ['account', 'preferences', 'security', 'shares', 'notifications', 'data'] as const;

// A malformed hash (`#%E0`) makes decodeURIComponent throw: treat it as no hash.
const currentHashId = () => {
  if (typeof window === 'undefined') return '';
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return '';
  }
};

// After a click or a hash jump the page scrolls on its own; the scroll
// observer must not overwrite the section just chosen while it settles.
const SCROLL_SETTLE_MS = 600;

export function ProfileClient() {
  const { t } = useTranslation();
  const { data: user, isLoading: isLoadingUser } = useMe();
  const logout = useLogout();
  // One mutation per form, so each Save button spins for its own form only.
  const updateProfile = useUpdateProfile();
  const updateAppDisplay = useUpdateProfile();
  const updatePrefs = useUpdatePreferences();

  const [profileData, setProfileData] = useState({ displayName: '', appName: '', appSlogan: '' });
  const [prefsData, setPrefsData] = useState({
    theme: 'SYSTEM' as 'LIGHT' | 'DARK' | 'SYSTEM',
    language: 'FR' as 'FR' | 'EN',
    tempUnit: 'CELSIUS' as 'CELSIUS' | 'FAHRENHEIT',
    dateFormat: 'SYSTEM' as 'SYSTEM' | 'H24' | 'H12',
    accentColor: DEFAULT_ACCENT,
    expertMode: false,
  });
  // Seeding form state once the user loads is adjusted during render
  // (React's documented pattern) rather than in an effect, guarded against
  // the previous render's user so it only fires when the fetched user
  // reference actually changes. It starts empty so a member already in the
  // query cache (client-side navigation) is seeded too, not left blank.
  // The text fields are filled once per member only: every save (a theme
  // auto-saved, the other form) updates the member, and refilling them then
  // wiped what was being typed. The auto-saved settings follow the member.
  const [prevUser, setPrevUser] = useState<typeof user>(undefined);
  const [textSeededFor, setTextSeededFor] = useState<string | undefined>(undefined);
  if (user !== prevUser) {
    setPrevUser(user);
    if (user) {
      if (user.id !== textSeededFor) {
        setTextSeededFor(user.id);
        setProfileData({ displayName: user.displayName || '', appName: user.appName || '', appSlogan: user.appSlogan || '' });
      }
      setPrefsData({
        theme: user.theme || 'SYSTEM',
        language: user.language || 'FR',
        tempUnit: user.tempUnit || 'CELSIUS',
        dateFormat: user.dateFormat || 'SYSTEM',
        // A colour stored before #648 shows as its new preset.
        accentColor: resolveAccentPreset(user.accentColor).light.DEFAULT,
        expertMode: user.expertMode ?? false,
      });
    }
  }

  // #769: the display name is how the other members see you; the app name
  // and slogan are display settings of your own, saved from the preferences card.
  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate({ displayName: profileData.displayName }, {
      onSuccess: () => notifySuccess('profile.saveSuccess'),
    });
  };

  const handleAppDisplaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateAppDisplay.mutate({ appName: profileData.appName, appSlogan: profileData.appSlogan }, {
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

  const [activeSection, setActiveSection] = useState<string>(() => {
    const id = currentHashId();
    return (SECTION_IDS as readonly string[]).includes(id) ? id : SECTION_IDS[0];
  });
  const lockedUntil = useRef(0);
  const chooseSection = (id: string) => {
    lockedUntil.current = Date.now() + SCROLL_SETTLE_MS;
    setActiveSection(id);
  };

  // #839: the sections only exist once the member is loaded, so the browser
  // cannot scroll to `#shares` by itself on a direct load (or from the
  // security e-mail). Scroll once they are rendered, and follow later changes.
  // #779: the section in view is marked in the shortcuts row.
  useEffect(() => {
    if (isLoadingUser) return;
    const goToHash = () => {
      const id = currentHashId();
      if (!id) return false;
      document.getElementById(id)?.scrollIntoView();
      if ((SECTION_IDS as readonly string[]).includes(id)) chooseSection(id);
      return true;
    };
    // Cards above the target (sessions, shares) may load after the first
    // scroll and push it down: scroll again for a couple of frames.
    const frames: number[] = [];
    if (goToHash()) {
      const again = (left: number) => {
        if (left === 0) return;
        frames.push(requestAnimationFrame(() => {
          const id = currentHashId();
          if (id) document.getElementById(id)?.scrollIntoView();
          again(left - 1);
        }));
      };
      again(2);
    }
    const onHashChange = () => { goToHash(); };
    window.addEventListener('hashchange', onHashChange);

    // Sections currently crossing a band near the top of the viewport. The
    // active one is the last of them in page order (side-by-side cards both
    // cross it), or the last section once the page is scrolled to the bottom
    // (a short last card never reaches the band).
    const inBand = new Set<string>();
    const refresh = () => {
      if (Date.now() < lockedUntil.current) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom && window.scrollY > 0) {
        setActiveSection(SECTION_IDS[SECTION_IDS.length - 1]);
        return;
      }
      const current = [...SECTION_IDS].reverse().find((id) => inBand.has(id));
      if (current) setActiveSection(current);
    };
    window.addEventListener('scroll', refresh, { passive: true });

    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) inBand.add(entry.target.id);
            else inBand.delete(entry.target.id);
          });
          refresh();
        },
        { rootMargin: '-15% 0px -75% 0px' },
      );
      SECTION_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) observer?.observe(el);
      });
    }
    return () => {
      frames.forEach((f) => cancelAnimationFrame(f));
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('scroll', refresh);
      observer?.disconnect();
    };
  }, [isLoadingUser, user?.id]);

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
        <PageHeader icon={User} title={t('profile.title')} className="mb-4" />

        {/* #513: ten stacked sections on a phone — a row of anchors gets to
            the right one directly. (The former Wishlist & Budget shortcut is
            gone: that page is in the navigation now.) */}
        <nav aria-label={t('profile.sectionsNav')} className="flex flex-wrap gap-2 mb-6">
          {SECTION_IDS.map((id) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={activeSection === id ? 'true' : undefined}
              onClick={() => chooseSection(id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border focus-visible:outline-2 focus-visible:outline-primary ${
                activeSection === id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-divider text-foreground-600 hover:bg-default-100'
              }`}
            >
              {t(`profile.sectionLabels.${id}`)}
            </a>
          ))}
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Personal Info */}
          <div id="account" className="bg-content1 border border-divider rounded-2xl p-6 scroll-mt-24">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <User size={18} className="text-primary" />
                <h2 className="text-base font-semibold">{t('profile.personalInfo')}</h2>
              </div>
              {user && (
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${user.isAdmin ? 'bg-primary text-primary-foreground' : 'bg-default-100 text-foreground-500 border border-divider'}`}>
                  {user.isAdmin ? t('nav.roleAdmin') : t('nav.roleUser')}
                </span>
              )}
            </div>

            {user && <AvatarUploader user={user} />}

            <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4 mt-2">
              <Input
                label={t('auth.displayName')}
                description={t('profile.displayNameHint')}
                value={profileData.displayName}
                onValueChange={(v) => setProfileData(prev => ({ ...prev, displayName: v }))}
                maxLength={60}
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
          <div id="preferences" className="bg-content1 border border-divider rounded-2xl p-6 scroll-mt-24">
            <div className="flex items-center gap-2 mb-5">
              <Settings size={18} className="text-primary" />
              <h2 className="text-base font-semibold">{t('profile.preferences')}</h2>
            </div>

            <div className="flex flex-col gap-4">
              <SingleSelect
                label={t('profile.theme')}
                selectedKeys={[prefsData.theme]}
                onSelectionChange={(keys) => handlePrefsChange('theme', Array.from(keys)[0] as string)}
                variant="bordered" size="sm" radius="md" labelPlacement="outside"
              >
                <SelectItem key="SYSTEM">{t('profile.themes.SYSTEM')}</SelectItem>
                <SelectItem key="LIGHT">{t('profile.themes.LIGHT')}</SelectItem>
                <SelectItem key="DARK">{t('profile.themes.DARK')}</SelectItem>
              </SingleSelect>

              <SingleSelect
                label={t('profile.language')}
                selectedKeys={[prefsData.language]}
                onSelectionChange={(keys) => handlePrefsChange('language', Array.from(keys)[0] as string)}
                variant="bordered" size="sm" radius="md" labelPlacement="outside"
              >
                <SelectItem key="FR">Français</SelectItem>
                <SelectItem key="EN">English</SelectItem>
              </SingleSelect>

              <SingleSelect
                label={t('profile.tempUnit')}
                selectedKeys={[prefsData.tempUnit]}
                onSelectionChange={(keys) => handlePrefsChange('tempUnit', Array.from(keys)[0] as string)}
                variant="bordered" size="sm" radius="md" labelPlacement="outside"
              >
                <SelectItem key="CELSIUS">°Celsius</SelectItem>
                <SelectItem key="FAHRENHEIT">°Fahrenheit</SelectItem>
              </SingleSelect>

              <SingleSelect
                label={t('profile.dateFormat')}
                selectedKeys={[prefsData.dateFormat]}
                onSelectionChange={(keys) => handlePrefsChange('dateFormat', Array.from(keys)[0] as string)}
                variant="bordered" size="sm" radius="md" labelPlacement="outside"
              >
                <SelectItem key="SYSTEM">{t('profile.dateFormats.SYSTEM')}</SelectItem>
                <SelectItem key="H24">{t('profile.dateFormats.H24')}</SelectItem>
                <SelectItem key="H12">{t('profile.dateFormats.H12')}</SelectItem>
              </SingleSelect>

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

            {/* #769: shown in this member's own menu only. */}
            <form onSubmit={handleAppDisplaySubmit} className="flex flex-col gap-4 mt-4 pt-4 border-t border-divider">
              <p className="text-xs text-foreground-500">{t('profile.appDisplayHint')}</p>
              <Input
                label={t('profile.appName')}
                value={profileData.appName}
                onValueChange={(v) => setProfileData(prev => ({ ...prev, appName: v }))}
                placeholder={t('profile.appNamePlaceholder')}
                maxLength={40}
                variant="bordered" size="sm" radius="md" labelPlacement="outside"
              />
              <Input
                label={t('profile.appSlogan')}
                value={profileData.appSlogan}
                onValueChange={(v) => setProfileData(prev => ({ ...prev, appSlogan: v }))}
                placeholder={t('profile.appSloganPlaceholder')}
                maxLength={100}
                variant="bordered" size="sm" radius="md" labelPlacement="outside"
              />
              <Button
                type="submit" color="primary" variant="bordered" size="sm" radius="md"
                isLoading={updateAppDisplay.isPending} isDisabled={updateAppDisplay.isPending}
              >
                {t('profile.appDisplaySave')}
              </Button>
            </form>

            <div className="mt-6 p-3 bg-default-50 rounded-xl">
              <p className="text-xs text-foreground-400">
                {t('profile.preferencesHint')}
              </p>
            </div>
          </div>
        </div>

        {/* Admin panel shortcut */}
        {/* md:hidden (#774): the sidebar has this link from 768 px up; below that it is in the bottom bar's "More" sheet and kept here. */}
        {user?.isAdmin && (
          <div className="mt-6 md:hidden">
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

        {/* Security: one card (#766: sign-in, two-factor, trusted device, app lock), then the sessions */}
        {user && (
          <div id="security" className="flex flex-col gap-6 mt-6 scroll-mt-24">
            <AccountSecurity user={user} />
            <SessionsPanel />
          </div>
        )}

        {/* Guest shares */}
        <div id="shares" className="mt-6 scroll-mt-24">
          <SharesDashboard />
        </div>

        {/* Notifications */}
        <div id="notifications" className="mt-6 scroll-mt-24">
          <NotificationPreferences />
        </div>

        {/* RGPD */}
        {user && (
          <div id="data" className="mt-6 scroll-mt-24">
            <GdprSection user={user} />
          </div>
        )}

        {/* Running version (#696) */}
        <AppVersion />

        {/* md:hidden (#774): the sidebar has the sign-out button from 768 px up; on a phone this is the only place for it. */}
        <div className="mt-6 md:hidden">
          <Button
            color="default"
            variant="bordered"
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
