import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { User, FlaskConical, RefreshCw, Palette, Bell, Download, Info } from 'lucide-react';
import clsx from 'clsx';
import { usePageTitle } from '../hooks/usePageTitle';
import { isElectronAvailable } from '../lib/electron';
import { AccountSettings } from '../features/settings/components/AccountSettings';
import { SandboxSettings } from '../features/settings/components/SandboxSettings';
import { BackgroundSettings } from '../features/settings/components/BackgroundSettings';
import { AppearanceSettings } from '../features/settings/components/AppearanceSettings';
import { NotificationSettings } from '../features/settings/components/NotificationSettings';
import { UpdateSettings } from '../features/settings/components/UpdateSettings';
import { AboutSettings } from '../features/settings/components/AboutSettings';

const TABS = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'sandbox', label: 'Sandbox', icon: FlaskConical },
  { id: 'background', label: 'Background', icon: RefreshCw },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'updates', label: 'Updates', icon: Download },
  { id: 'about', label: 'About', icon: Info },
] as const;

type TabId = (typeof TABS)[number]['id'];

const sectionVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

export default function Settings() {
  usePageTitle('Settings');
  const reduceMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabId) || 'account';
  const [activeTab, setActiveTab] = useState<TabId>(
    TABS.some((t) => t.id === initialTab) ? initialTab : 'account'
  );
  const [appVersion, setAppVersion] = useState('');
  const [platform, setPlatform] = useState('');
  const [secureStorageAvailable, setSecureStorageAvailable] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadAppInfo = async () => {
      if (isElectronAvailable()) {
        const version = await window.electronAPI!.app.getVersion();
        const plat = await window.electronAPI!.app.getPlatform();
        const secureStorage = (await window.electronAPI!.auth?.isSecureStorageAvailable()) ?? true;
        setAppVersion(version);
        setPlatform(plat);
        setSecureStorageAvailable(secureStorage);
      }
    };
    loadAppInfo();
  }, []);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'account':
        return <AccountSettings secureStorageAvailable={secureStorageAvailable} />;
      case 'sandbox':
        return <SandboxSettings secureStorageAvailable={secureStorageAvailable} />;
      case 'background':
        return <BackgroundSettings />;
      case 'appearance':
        return <AppearanceSettings />;
      case 'notifications':
        return <NotificationSettings />;
      case 'updates':
        return <UpdateSettings appVersion={appVersion} />;
      case 'about':
        return <AboutSettings appVersion={appVersion} platform={platform} />;
    }
  };

  return (
    <div className="page-shell h-full">
      <div className="mb-6 mt-2">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your app preferences</p>
      </div>

      <div className="flex gap-6 min-h-0 flex-1">
        {/* Sidebar tabs */}
        <nav className="w-48 shrink-0 space-y-0.5" aria-label="Settings sections">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                  isActive
                    ? 'bg-brand-500/15 text-brand-300 border border-brand-500/20'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-slate-800/50 border border-transparent'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon
                  className={clsx(
                    'w-4 h-4 shrink-0',
                    isActive ? 'text-brand-400' : 'text-gray-500'
                  )}
                  aria-hidden="true"
                />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div ref={contentRef} className="flex-1 min-w-0 overflow-y-auto pb-12">
          <motion.div
            key={activeTab}
            variants={reduceMotion ? undefined : sectionVariants}
            initial={reduceMotion ? undefined : 'hidden'}
            animate={reduceMotion ? undefined : 'visible'}
          >
            {renderContent()}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
