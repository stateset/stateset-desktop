import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import { usePreferencesStore } from './stores/preferences';
import Layout from './components/Layout';
import { AppLoadingScreen } from './components/AppLoadingScreen';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { useBackgroundAgents } from './hooks/useBackgroundAgents';
import { useAuditLogStore } from './stores/auditLog';
import { MotionConfig } from 'framer-motion';

// Lazy load pages for better initial load performance
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AgentConsole = lazy(() => import('./pages/AgentConsole'));
const Connections = lazy(() => import('./pages/Connections'));
const Settings = lazy(() => import('./pages/Settings'));
const Analytics = lazy(() => import('./pages/Analytics'));
const ChatPlayground = lazy(() => import('./pages/ChatPlayground'));
const Webhooks = lazy(() => import('./pages/Webhooks'));
const Templates = lazy(() => import('./pages/Templates'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Onboarding = lazy(() => import('./components/Onboarding'));
const OfflineBanner = lazy(() => import('./components/OfflineBanner'));

// Page loading fallback
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const initialize = useAuthStore((s) => s.initialize);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const handleRetry = () => {
    clearError();
    initialize();
  };

  if (isLoading) {
    return <AppLoadingScreen status="authenticating" />;
  }

  // Show error screen for critical errors that prevent app from loading
  // Network errors with cached credentials still allow the app to load
  if (error && !isAuthenticated && error.code !== 'NETWORK_ERROR') {
    return <AppLoadingScreen status="authenticating" error={error} onRetry={handleRetry} />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AuthenticatedApp() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasCheckedOnboarding, setHasCheckedOnboarding] = useState(false);
  const autoStartAgentsOnLaunch = usePreferencesStore((s) => s.autoStartAgentsOnLaunch);
  const initializeAuditLog = useAuditLogStore((s) => s.initialize);

  useEffect(() => {
    initializeAuditLog();
  }, [initializeAuditLog]);

  // Initialize background agents manager
  // This syncs agent status to the system tray and handles auto-restart
  useBackgroundAgents({
    autoRestart: autoStartAgentsOnLaunch,
    syncToTray: true,
    showNotifications: true,
  });

  // Check if user has completed onboarding
  useEffect(() => {
    const checkOnboarding = async () => {
      if (typeof window.electronAPI !== 'undefined') {
        if (window.electronAPI.app?.isE2ETest) {
          setShowOnboarding(false);
          setHasCheckedOnboarding(true);
          return;
        }
        const hasCompletedOnboarding = await window.electronAPI.store.get('onboardingCompleted');
        setShowOnboarding(!hasCompletedOnboarding);
      }
      setHasCheckedOnboarding(true);
    };
    checkOnboarding();
  }, []);

  const handleOnboardingComplete = async () => {
    if (typeof window.electronAPI !== 'undefined') {
      await window.electronAPI.store.set('onboardingCompleted', true);
    }
    setShowOnboarding(false);
  };

  if (!hasCheckedOnboarding) {
    return <AppLoadingScreen status="loading" />;
  }

  if (showOnboarding) {
    return (
      <Suspense fallback={<AppLoadingScreen status="loading" />}>
        <Onboarding onComplete={handleOnboardingComplete} />
      </Suspense>
    );
  }

  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <OfflineBanner />
        <Routes>
          <Route
            path="/"
            element={
              <RouteErrorBoundary>
                <Dashboard />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/agent/:sessionId"
            element={
              <RouteErrorBoundary>
                <AgentConsole />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/analytics"
            element={
              <RouteErrorBoundary>
                <Analytics />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/connections"
            element={
              <RouteErrorBoundary>
                <Connections />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/settings"
            element={
              <RouteErrorBoundary>
                <Settings />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/playground"
            element={
              <RouteErrorBoundary>
                <ChatPlayground />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/webhooks"
            element={
              <RouteErrorBoundary>
                <Webhooks />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/templates"
            element={
              <RouteErrorBoundary>
                <Templates />
              </RouteErrorBoundary>
            }
          />
          <Route
            path="/audit-log"
            element={
              <RouteErrorBoundary>
                <AuditLog />
              </RouteErrorBoundary>
            }
          />
        </Routes>
      </Suspense>
    </Layout>
  );
}

export default function App() {
  const initializeAuth = useAuthStore((s) => s.initialize);
  const initializePreferences = usePreferencesStore((s) => s.initialize);
  const reduceMotion = usePreferencesStore((s) => s.reduceMotion);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    initializePreferences();
  }, [initializePreferences]);

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<AppLoadingScreen status="loading" />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AuthenticatedApp />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </MotionConfig>
  );
}
