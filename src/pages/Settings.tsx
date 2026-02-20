import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { AccountSettings } from '../features/settings/components/AccountSettings';
import { SandboxSettings } from '../features/settings/components/SandboxSettings';
import { BackgroundSettings } from '../features/settings/components/BackgroundSettings';
import { AppearanceSettings } from '../features/settings/components/AppearanceSettings';
import { NotificationSettings } from '../features/settings/components/NotificationSettings';
import { UpdateSettings } from '../features/settings/components/UpdateSettings';
import { AboutSettings } from '../features/settings/components/AboutSettings';

export default function Settings() {
  usePageTitle('Settings');
  const [appVersion, setAppVersion] = useState('');
  const [platform, setPlatform] = useState('');
  const [secureStorageAvailable, setSecureStorageAvailable] = useState(true);

  useEffect(() => {
    const loadAppInfo = async () => {
      if (window.electronAPI) {
        const version = await window.electronAPI.app.getVersion();
        const plat = await window.electronAPI.app.getPlatform();
        const secureStorage = window.electronAPI.auth?.isSecureStorageAvailable
          ? await window.electronAPI.auth.isSecureStorageAvailable()
          : true;
        setAppVersion(version);
        setPlatform(plat);
        setSecureStorageAvailable(secureStorage);
      }
    };
    loadAppInfo();
  }, []);

  return (
    <div className="p-6 pb-10 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-gray-400 mt-1">Manage your app preferences</p>
      </div>

      <div className="space-y-4 md:space-y-6">
        <AccountSettings secureStorageAvailable={secureStorageAvailable} />
        <SandboxSettings secureStorageAvailable={secureStorageAvailable} />
        <BackgroundSettings />
        <AppearanceSettings />
        <NotificationSettings />
        <UpdateSettings appVersion={appVersion} />
        <AboutSettings appVersion={appVersion} platform={platform} />
      </div>
    </div>
  );
}
