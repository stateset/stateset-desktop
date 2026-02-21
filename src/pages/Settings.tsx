import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { usePageTitle } from '../hooks/usePageTitle';
import { AccountSettings } from '../features/settings/components/AccountSettings';
import { SandboxSettings } from '../features/settings/components/SandboxSettings';
import { BackgroundSettings } from '../features/settings/components/BackgroundSettings';
import { AppearanceSettings } from '../features/settings/components/AppearanceSettings';
import { NotificationSettings } from '../features/settings/components/NotificationSettings';
import { UpdateSettings } from '../features/settings/components/UpdateSettings';
import { AboutSettings } from '../features/settings/components/AboutSettings';

const sectionVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

export default function Settings() {
  usePageTitle('Settings');
  const reduceMotion = useReducedMotion();
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
    <div className="page-shell max-w-3xl mx-auto pb-12">
      <div className="mb-8 mt-2">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your app preferences</p>
      </div>

      <motion.div
        className="space-y-6 md:space-y-8"
        variants={reduceMotion ? undefined : containerVariants}
        initial={reduceMotion ? undefined : 'hidden'}
        animate={reduceMotion ? undefined : 'visible'}
      >
        <motion.div variants={reduceMotion ? undefined : sectionVariants}>
          <AccountSettings secureStorageAvailable={secureStorageAvailable} />
        </motion.div>
        <motion.div variants={reduceMotion ? undefined : sectionVariants}>
          <SandboxSettings secureStorageAvailable={secureStorageAvailable} />
        </motion.div>
        <motion.div variants={reduceMotion ? undefined : sectionVariants}>
          <BackgroundSettings />
        </motion.div>
        <motion.div variants={reduceMotion ? undefined : sectionVariants}>
          <AppearanceSettings />
        </motion.div>
        <motion.div variants={reduceMotion ? undefined : sectionVariants}>
          <NotificationSettings />
        </motion.div>
        <motion.div variants={reduceMotion ? undefined : sectionVariants}>
          <UpdateSettings appVersion={appVersion} />
        </motion.div>
        <motion.div variants={reduceMotion ? undefined : sectionVariants}>
          <AboutSettings appVersion={appVersion} platform={platform} />
        </motion.div>
      </motion.div>
    </div>
  );
}
