"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const electron_store_1 = __importDefault(require("electron-store"));
const electron_updater_1 = require("electron-updater");
const Sentry = __importStar(require("@sentry/electron/main"));
const shopify_1 = require("./oauth/shopify");
const gorgias_1 = require("./oauth/gorgias");
const zendesk_1 = require("./oauth/zendesk");
const url_security_1 = require("./url-security");
const sanitization_1 = require("./sanitization");
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const isE2ETest = process.env.E2E_TEST === 'true' || process.env.PLAYWRIGHT_TEST === 'true';
const DEV_SERVER_ORIGINS = new Set(url_security_1.ALLOWED_HTTP_LOCALHOST_ORIGINS);
const DEFAULT_DEV_SERVER_URL = 'http://localhost:5173';
const CONFIGURED_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL?.trim() || DEFAULT_DEV_SERVER_URL;
const DEV_SERVER_URL = (() => {
    if (electron_1.app.isPackaged) {
        return DEFAULT_DEV_SERVER_URL;
    }
    try {
        const parsed = new URL(CONFIGURED_DEV_SERVER_URL);
        if (parsed.username || parsed.password) {
            return DEFAULT_DEV_SERVER_URL;
        }
        if (DEV_SERVER_ORIGINS.has(parsed.origin)) {
            return CONFIGURED_DEV_SERVER_URL;
        }
    }
    catch {
        // Ignore malformed URLs and fall back to default.
    }
    return DEFAULT_DEV_SERVER_URL;
})();
const AUTO_UPDATER_DISABLED_BY_ENV = process.env.DISABLE_AUTO_UPDATER === 'true';
const STORE_KEYS = new Set([
    'theme',
    'minimizeToTray',
    'desktopNotifications',
    'soundAlerts',
    'onboardingCompleted',
    'runningAgents',
    'trayNotificationShown',
    'agentLogs',
    'telemetryEnabled',
    'telemetryUserId',
    // New preferences
    'accentColor',
    'reduceMotion',
    'compactMode',
    'autoStartAgentsOnLaunch',
    'refreshInterval',
    'pageSize',
    'customAgentTemplates',
    'chatPlaygroundConversations',
    'auditLog',
    'currentBrandId',
]);
const OAUTH_SECRET_KEYS = {
    shopifyClientId: 'oauth:shopify:clientId',
    shopifyClientSecret: 'oauth:shopify:clientSecret',
    gorgiasClientId: 'oauth:gorgias:clientId',
    gorgiasClientSecret: 'oauth:gorgias:clientSecret',
    zendeskClientId: 'oauth:zendesk:clientId',
    zendeskClientSecret: 'oauth:zendesk:clientSecret',
};
function loadOAuthCredentials(options) {
    const clientIdFromStore = getSecureValue({
        storeKey: options.clientIdStoreKey,
        inMemoryKey: `oauth:${options.clientIdStoreKey}`,
    });
    const clientSecretFromStore = getSecureValue({
        storeKey: options.clientSecretStoreKey,
        inMemoryKey: `oauth:${options.clientSecretStoreKey}`,
    });
    const clientId = clientIdFromStore ?? process.env[options.clientIdEnv] ?? '';
    const clientSecret = clientSecretFromStore ?? process.env[options.clientSecretEnv] ?? '';
    if (electron_1.app.isPackaged) {
        delete process.env[options.clientIdEnv];
        delete process.env[options.clientSecretEnv];
    }
    return { clientId, clientSecret };
}
const ALLOWED_PERMISSION_TYPES = new Set(['clipboard-read', 'clipboard-write']);
const APP_RENDERER_ROOT = path.normalize(path.join(__dirname, '../renderer'));
const CONFIGURED_API_ENDPOINT = (0, url_security_1.getConfiguredApiEndpoint)();
const CONFIGURED_API_URL = new URL(CONFIGURED_API_ENDPOINT);
const CONFIGURED_SANDBOX_API_URL = process.env.VITE_SANDBOX_API_URL ||
    process.env.SANDBOX_API_URL ||
    'https://api.sandbox.stateset.app';
const SANDBOX_API_URL = (() => {
    try {
        return new URL(CONFIGURED_SANDBOX_API_URL);
    }
    catch {
        return new URL('https://api.sandbox.stateset.app');
    }
})();
const CORS_ORIGIN_URLS = [
    `${CONFIGURED_API_URL.protocol}//${CONFIGURED_API_URL.host}/*`,
    `${SANDBOX_API_URL.protocol}//${SANDBOX_API_URL.host}/*`,
];
const API_REQUEST_URL_PATTERNS = Array.from(new Set(CORS_ORIGIN_URLS));
const CONFIGURED_API_WS_SCHEME = CONFIGURED_API_URL.protocol === 'https:' ? 'wss:' : 'ws:';
const CSP_CONNECT_HOSTS = electron_1.app.isPackaged
    ? `${CONFIGURED_API_URL.origin} ${CONFIGURED_API_WS_SCHEME}//${CONFIGURED_API_URL.host}`
    : `${CONFIGURED_API_URL.origin} ${CONFIGURED_API_WS_SCHEME}//${CONFIGURED_API_URL.host} ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:* ws://[::1]:* http://[::1]:*`;
const CSP_HEADER = "default-src 'self'; " +
    "base-uri 'none'; " +
    "form-action 'self'; " +
    "frame-ancestors 'none'; " +
    "img-src 'self' https: data:; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "style-src 'self' https://fonts.googleapis.com; " +
    "style-src-attr 'unsafe-inline'; " +
    "style-src-elem 'self' https://fonts.googleapis.com; " +
    "script-src 'self'; " +
    `connect-src 'self' ${CSP_CONNECT_HOSTS}; ` +
    "object-src 'none'; " +
    'upgrade-insecure-requests';
const SECURITY_HEADERS = {
    referrerPolicy: 'strict-origin-when-cross-origin',
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    crossOriginResourcePolicy: 'same-site',
    crossOriginOpenerPolicy: 'same-origin',
    permissionsPolicy: 'accelerometer=(), ambient-light-sensor=(), autoplay=(), camera=(), display-capture=(), document-domain=(), ' +
        'encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), ' +
        'payment=(), usb=(), xr-spatial-tracking=(), interest-cohort=()',
};
if (isWindows) {
    electron_1.app.setAppUserModelId('io.stateset.desktop');
}
const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) {
    // Initialize Sentry for crash reporting
    Sentry.init({
        dsn: sentryDsn,
        environment: electron_1.app.isPackaged ? 'production' : 'development',
        release: `stateset-desktop@${electron_1.app.getVersion()}`,
        beforeSend(event) {
            // Don't send events in development
            if (!electron_1.app.isPackaged) {
                return null;
            }
            // Strip sensitive data from structured event data
            if (event.message) {
                event.message = (0, sanitization_1.sanitizeSensitiveText)(event.message);
            }
            if (event.transaction) {
                event.transaction = (0, sanitization_1.sanitizeSensitiveText)(event.transaction);
            }
            if (event.extra) {
                event.extra = (0, sanitization_1.sanitizeValue)(event.extra);
            }
            if (event.tags) {
                event.tags = (0, sanitization_1.sanitizeValue)(event.tags);
            }
            if (event.request) {
                if (event.request.url) {
                    event.request.url = (0, sanitization_1.sanitizeSensitiveText)(event.request.url);
                }
                if (event.request.query_string) {
                    event.request.query_string = (0, sanitization_1.sanitizeQueryParams)(event.request.query_string);
                }
                if (event.request.headers) {
                    event.request.headers = (0, sanitization_1.sanitizeStringRecord)(event.request.headers);
                }
                if (event.request.data) {
                    event.request.data = (0, sanitization_1.sanitizeValue)(event.request.data);
                }
                if (event.request.cookies) {
                    event.request.cookies = (0, sanitization_1.sanitizeStringRecord)(event.request.cookies);
                }
            }
            if (event.user) {
                event.user = (0, sanitization_1.sanitizeValue)(event.user);
            }
            if (event.breadcrumbs) {
                for (const crumb of event.breadcrumbs) {
                    if (crumb.message) {
                        crumb.message = (0, sanitization_1.sanitizeSensitiveText)(crumb.message);
                    }
                    if (crumb.data) {
                        crumb.data = (0, sanitization_1.sanitizeValue)(crumb.data);
                    }
                }
            }
            return event;
        },
    });
}
// Initialize electron store for persisting data
const storeEncryptionKey = process.env.STORE_ENCRYPTION_KEY;
if (!storeEncryptionKey && electron_1.app.isPackaged) {
    throw new Error('STORE_ENCRYPTION_KEY is not set. ' +
        'A 32+ character encryption key is required in production to protect stored configuration.');
}
const store = new electron_store_1.default({
    name: 'stateset-config',
    ...(storeEncryptionKey ? { encryptionKey: storeEncryptionKey } : {}),
});
let mainWindow = null;
let tray = null;
let isQuitting = false;
function createInitialUpdateStatusSnapshot() {
    const updaterStatus = getAutoUpdaterStatus();
    if (!updaterStatus.enabled) {
        return {
            status: 'disabled',
            checking: false,
            available: false,
            progress: 0,
            message: updaterStatus.reason || 'Updates disabled in this build',
        };
    }
    return {
        status: 'idle',
        checking: false,
        available: false,
        progress: 0,
    };
}
let updateStatusSnapshot = createInitialUpdateStatusSnapshot();
function setUpdateStatusSnapshot(snapshot) {
    updateStatusSnapshot = {
        ...updateStatusSnapshot,
        ...snapshot,
    };
}
// In-memory fallback storage when secure storage is unavailable
const inMemorySecrets = new Map();
/**
 * Encrypts and stores a secret value using Electron's safeStorage API.
 * Falls back to in-memory storage when encryption is unavailable.
 */
function setSecureValue(value, options) {
    const { storeKey, inMemoryKey, legacyKey } = options;
    if (electron_1.safeStorage.isEncryptionAvailable()) {
        const encrypted = electron_1.safeStorage.encryptString(value).toString('base64');
        store.set(storeKey, encrypted);
        if (legacyKey) {
            store.delete(legacyKey);
        }
        inMemorySecrets.delete(inMemoryKey);
        return true;
    }
    // Fallback to in-memory storage
    inMemorySecrets.set(inMemoryKey, value);
    store.delete(storeKey);
    if (legacyKey) {
        store.delete(legacyKey);
    }
    return true;
}
/**
 * Retrieves and decrypts a secret value from storage.
 * Handles migration from legacy unencrypted storage.
 */
function getSecureValue(options) {
    const { storeKey, inMemoryKey, legacyKey } = options;
    // Try encrypted storage first
    const encrypted = store.get(storeKey);
    if (typeof encrypted === 'string' && electron_1.safeStorage.isEncryptionAvailable()) {
        try {
            return electron_1.safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
        }
        catch (error) {
            console.error(`Failed to decrypt ${storeKey}:`, error);
            store.delete(storeKey);
        }
    }
    // Fallback to in-memory when encryption unavailable
    if (!electron_1.safeStorage.isEncryptionAvailable()) {
        const inMemoryValue = inMemorySecrets.get(inMemoryKey);
        if (inMemoryValue) {
            return inMemoryValue;
        }
        // Check legacy storage and migrate to in-memory
        if (legacyKey) {
            const legacy = store.get(legacyKey);
            if (typeof legacy === 'string') {
                inMemorySecrets.set(inMemoryKey, legacy);
                store.delete(legacyKey);
                return legacy;
            }
        }
        return undefined;
    }
    // Migrate legacy storage to encrypted
    if (legacyKey) {
        const legacy = store.get(legacyKey);
        if (typeof legacy === 'string') {
            const encryptedLegacy = electron_1.safeStorage.encryptString(legacy).toString('base64');
            store.set(storeKey, encryptedLegacy);
            store.delete(legacyKey);
            return legacy;
        }
    }
    return undefined;
}
/**
 * Clears a secret value from all storage locations.
 */
function clearSecureValue(options) {
    const { storeKey, inMemoryKey, legacyKey } = options;
    store.delete(storeKey);
    if (legacyKey) {
        store.delete(legacyKey);
    }
    inMemorySecrets.delete(inMemoryKey);
    return true;
}
// Storage configuration for different secret types
const API_KEY_STORAGE = {
    storeKey: 'apiKeyEncrypted',
    inMemoryKey: 'apiKey',
    legacyKey: 'apiKey',
};
const SANDBOX_KEY_STORAGE = {
    storeKey: 'sandboxApiKeyEncrypted',
    inMemoryKey: 'sandboxApiKey',
};
const LOCAL_SECRETS_STORAGE = {
    storeKey: 'localSecretsEncrypted',
    inMemoryKey: 'localSecrets',
};
// OAuth handlers
const shopifyOAuth = new shopify_1.ShopifyOAuth(loadOAuthCredentials({
    clientIdEnv: 'SHOPIFY_CLIENT_ID',
    clientSecretEnv: 'SHOPIFY_CLIENT_SECRET',
    clientIdStoreKey: OAUTH_SECRET_KEYS.shopifyClientId,
    clientSecretStoreKey: OAUTH_SECRET_KEYS.shopifyClientSecret,
}));
const gorgiasOAuth = new gorgias_1.GorgiasOAuth(loadOAuthCredentials({
    clientIdEnv: 'GORGIAS_CLIENT_ID',
    clientSecretEnv: 'GORGIAS_CLIENT_SECRET',
    clientIdStoreKey: OAUTH_SECRET_KEYS.gorgiasClientId,
    clientSecretStoreKey: OAUTH_SECRET_KEYS.gorgiasClientSecret,
}));
const zendeskOAuth = new zendesk_1.ZendeskOAuth(loadOAuthCredentials({
    clientIdEnv: 'ZENDESK_CLIENT_ID',
    clientSecretEnv: 'ZENDESK_CLIENT_SECRET',
    clientIdStoreKey: OAUTH_SECRET_KEYS.zendeskClientId,
    clientSecretStoreKey: OAUTH_SECRET_KEYS.zendeskClientSecret,
}));
function isAllowedAppUrl(targetUrl) {
    if ((0, url_security_1.isAllowedRendererNavigation)(targetUrl, APP_RENDERER_ROOT)) {
        return true;
    }
    if (!electron_1.app.isPackaged) {
        try {
            const parsed = new URL(targetUrl);
            return DEV_SERVER_ORIGINS.has(parsed.origin);
        }
        catch {
            return false;
        }
    }
    return false;
}
const isAllowedMainNavigation = isAllowedAppUrl;
const isAllowedRendererSource = isAllowedAppUrl;
function handleNavigationAttempt(event, targetUrl) {
    if (isAllowedMainNavigation(targetUrl)) {
        return;
    }
    event.preventDefault();
    if ((0, url_security_1.isSafeExternalUrl)(targetUrl)) {
        void electron_1.shell.openExternal(targetUrl);
    }
}
function assertStoreKey(key) {
    if (!STORE_KEYS.has(key)) {
        throw new Error(`Invalid store key: ${key}`);
    }
}
function assertBoolean(value, field) {
    if (typeof value !== 'boolean') {
        throw new Error(`${field} must be a boolean`);
    }
}
function assertNonEmptyString(value, field, maxLength = 1024) {
    if (typeof value !== 'string') {
        throw new Error(`${field} must be a string`);
    }
    if (!value.trim()) {
        throw new Error(`${field} must be a non-empty string`);
    }
    if (value.length > maxLength) {
        throw new Error(`${field} exceeds maximum length of ${maxLength}`);
    }
}
function assertSafeCount(value, field, max = 1000000) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) {
        throw new Error(`${field} must be a safe non-negative integer`);
    }
}
function assertOptionalObject(value, field) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${field} must be an object`);
    }
}
function getAutoUpdaterStatus() {
    if (isE2ETest) {
        return { enabled: false, reason: 'Updates disabled during tests' };
    }
    if (!electron_1.app.isPackaged) {
        return { enabled: false, reason: 'Updates disabled in development' };
    }
    if (AUTO_UPDATER_DISABLED_BY_ENV) {
        return { enabled: false, reason: 'Updates disabled by configuration' };
    }
    if (process.platform === 'linux' && !process.env.APPIMAGE) {
        return { enabled: false, reason: 'Updates require AppImage builds on Linux' };
    }
    return { enabled: true };
}
// ============================================
// Auto Updater Configuration
// ============================================
function setupAutoUpdater() {
    const updaterStatus = getAutoUpdaterStatus();
    if (!updaterStatus.enabled) {
        setUpdateStatusSnapshot({
            status: 'disabled',
            checking: false,
            available: false,
            progress: 0,
            message: updaterStatus.reason || 'Updates disabled in this build',
            error: undefined,
            version: undefined,
        });
        return;
    }
    setUpdateStatusSnapshot({
        status: 'idle',
        checking: false,
        available: false,
        progress: 0,
        message: undefined,
        error: undefined,
    });
    // Configure auto-updater
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.allowDowngrade = false;
    electron_updater_1.autoUpdater.on('checking-for-update', () => {
        console.log('Checking for updates...');
        setUpdateStatusSnapshot({
            status: 'checking',
            checking: true,
            available: false,
            progress: 0,
            message: undefined,
            error: undefined,
            version: undefined,
        });
        mainWindow?.webContents.send('updater:checking');
    });
    electron_updater_1.autoUpdater.on('update-available', (info) => {
        console.log('Update available:', info.version);
        setUpdateStatusSnapshot({
            status: 'available',
            checking: false,
            available: true,
            progress: 0,
            version: info.version,
            error: undefined,
            message: undefined,
        });
        mainWindow?.webContents.send('updater:available', info);
        // Show notification
        if (electron_1.Notification.isSupported()) {
            new electron_1.Notification({
                title: 'Update Available',
                body: `StateSet ${info.version} is available and will be installed automatically.`,
            }).show();
        }
    });
    electron_updater_1.autoUpdater.on('update-not-available', () => {
        console.log('No updates available');
        setUpdateStatusSnapshot({
            status: 'idle',
            checking: false,
            available: false,
            progress: 0,
            version: undefined,
            error: undefined,
            message: undefined,
        });
        mainWindow?.webContents.send('updater:not-available');
    });
    electron_updater_1.autoUpdater.on('download-progress', (progress) => {
        console.log(`Download progress: ${progress.percent.toFixed(1)}%`);
        setUpdateStatusSnapshot({
            status: 'downloading',
            checking: false,
            available: true,
            progress: Math.max(0, Math.min(100, progress.percent)),
            error: undefined,
            message: undefined,
        });
        mainWindow?.webContents.send('updater:progress', progress);
    });
    electron_updater_1.autoUpdater.on('update-downloaded', (info) => {
        console.log('Update downloaded:', info.version);
        setUpdateStatusSnapshot({
            status: 'ready',
            checking: false,
            available: true,
            progress: 100,
            version: info.version,
            error: undefined,
            message: undefined,
        });
        mainWindow?.webContents.send('updater:downloaded', info);
        // Show notification with option to restart
        if (electron_1.Notification.isSupported()) {
            const notification = new electron_1.Notification({
                title: 'Update Ready',
                body: `StateSet ${info.version} has been downloaded. Restart to apply the update.`,
            });
            notification.on('click', () => {
                electron_updater_1.autoUpdater.quitAndInstall();
            });
            notification.show();
        }
    });
    electron_updater_1.autoUpdater.on('error', (error) => {
        console.error('Auto-updater error:', error);
        Sentry.captureException(error);
        setUpdateStatusSnapshot({
            status: 'error',
            checking: false,
            error: error.message,
            message: undefined,
        });
        mainWindow?.webContents.send('updater:error', error.message);
    });
    // Check for updates on startup (after a short delay to let the app initialize)
    setTimeout(() => {
        if (electron_1.app.isPackaged) {
            electron_updater_1.autoUpdater.checkForUpdates().catch((err) => {
                console.error('Failed to check for updates:', err);
            });
        }
    }, 5000);
    // Check for updates every hour
    setInterval(() => {
        if (electron_1.app.isPackaged) {
            electron_updater_1.autoUpdater.checkForUpdates().catch((err) => {
                console.error('Failed to check for updates:', err);
            });
        }
    }, 60 * 60 * 1000);
}
// ============================================
// System Tray for Background Mode
// ============================================
function createTray() {
    const updaterStatus = getAutoUpdaterStatus();
    // Create tray icon - use template image on macOS for dark/light mode support
    const iconPath = process.platform === 'darwin'
        ? path.join(__dirname, '../assets/tray-icon-template.png')
        : path.join(__dirname, '../assets/tray-icon.png');
    // Use a simple icon if assets don't exist yet
    let trayIcon;
    try {
        trayIcon = electron_1.nativeImage.createFromPath(iconPath);
        if (trayIcon.isEmpty()) {
            // Create a simple 16x16 icon as fallback
            trayIcon = electron_1.nativeImage.createEmpty();
        }
    }
    catch {
        trayIcon = electron_1.nativeImage.createEmpty();
    }
    tray = new electron_1.Tray(trayIcon);
    tray.setToolTip('StateSet - AI Agents Running');
    const contextMenu = electron_1.Menu.buildFromTemplate([
        {
            label: 'Open StateSet',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            },
        },
        { type: 'separator' },
        {
            label: 'Agent Status',
            sublabel: 'Running in background',
            enabled: false,
        },
        { type: 'separator' },
        {
            label: 'Check for Updates',
            enabled: updaterStatus.enabled,
            click: () => {
                if (updaterStatus.enabled) {
                    electron_updater_1.autoUpdater.checkForUpdates().catch((error) => {
                        console.error('Failed to check for updates:', error);
                        Sentry.captureException(error);
                    });
                }
            },
        },
        { type: 'separator' },
        {
            label: 'Quit StateSet',
            click: () => {
                isQuitting = true;
                electron_1.app.quit();
            },
        },
    ]);
    tray.setContextMenu(contextMenu);
    // Double-click on tray icon to show window
    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}
function updateTrayStatus(status) {
    if (!tray)
        return;
    const tooltip = status.running > 0
        ? `StateSet - ${status.running} agent${status.running > 1 ? 's' : ''} running`
        : 'StateSet - No agents running';
    tray.setToolTip(tooltip);
}
// ============================================
// Main Window
// ============================================
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        ...(isMac ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 15, y: 15 } } : {}),
        backgroundColor: '#030712',
        show: false, // Don't show until ready
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            devTools: !electron_1.app.isPackaged,
            webviewTag: false,
        },
    });
    // Inject CORS headers for API requests so the renderer can reach the API/sandbox endpoints
    mainWindow.webContents.session.webRequest.onHeadersReceived({ urls: API_REQUEST_URL_PATTERNS }, (details, callback) => {
        const headers = { ...details.responseHeaders };
        const allowedOrigin = (0, url_security_1.resolveCorsOrigin)(details);
        headers['access-control-allow-origin'] = [allowedOrigin];
        headers['access-control-allow-headers'] = ['Authorization, Content-Type, X-Requested-With'];
        headers['access-control-allow-methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
        headers['access-control-allow-credentials'] = ['true'];
        callback({ responseHeaders: headers });
    });
    if (electron_1.app.isPackaged) {
        mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
            const headers = { ...details.responseHeaders };
            headers['content-security-policy'] = [CSP_HEADER];
            delete headers['content-security-policy-report-only'];
            delete headers['Content-Security-Policy-Report-Only'];
            headers['x-frame-options'] = [SECURITY_HEADERS.xFrameOptions];
            headers['referrer-policy'] = [SECURITY_HEADERS.referrerPolicy];
            headers['x-content-type-options'] = [SECURITY_HEADERS.xContentTypeOptions];
            headers['cross-origin-resource-policy'] = [SECURITY_HEADERS.crossOriginResourcePolicy];
            headers['cross-origin-opener-policy'] = [SECURITY_HEADERS.crossOriginOpenerPolicy];
            headers['permissions-policy'] = [SECURITY_HEADERS.permissionsPolicy];
            delete headers['cross-origin-embedder-policy'];
            delete headers['Cross-Origin-Embedder-Policy'];
            callback({ responseHeaders: headers });
        });
    }
    // Forward renderer console messages to terminal in dev mode
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        const tag = ['LOG', 'WARN', 'ERROR'][level] ?? 'LOG';
        if (!sourceId.includes('devtools://')) {
            console.log(`[Renderer ${tag}] ${message}`);
        }
    });
    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    // In development, load from Vite dev server
    if (process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged) {
        mainWindow.loadURL(DEV_SERVER_URL);
        mainWindow.webContents.openDevTools();
    }
    else {
        // In production, load the built files
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }
    // Prevent navigation outside the app shell
    mainWindow.webContents.on('will-navigate', (event, url) => {
        handleNavigationAttempt(event, url);
    });
    mainWindow.webContents.on('will-redirect', (event, url) => {
        handleNavigationAttempt(event, url);
    });
    // Handle window close - minimize to tray instead of quitting
    mainWindow.on('close', (event) => {
        if (!isQuitting && store.get('minimizeToTray', true)) {
            event.preventDefault();
            mainWindow?.hide();
            // Show notification on first minimize
            if (!store.get('trayNotificationShown')) {
                if (electron_1.Notification.isSupported()) {
                    new electron_1.Notification({
                        title: 'StateSet is still running',
                        body: 'Your agents continue to run in the background. Click the tray icon to open.',
                    }).show();
                }
                store.set('trayNotificationShown', true);
            }
        }
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
// ============================================
// App Lifecycle
// ============================================
// Single instance lock - prevent multiple instances
const gotTheLock = isE2ETest ? true : electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on('second-instance', () => {
        // Someone tried to run a second instance, focus our window
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
    electron_1.app.whenReady().then(() => {
        createWindow();
        if (!isE2ETest) {
            createTray();
        }
        setupAutoUpdater();
        electron_1.app.on('activate', () => {
            if (electron_1.BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
            else if (mainWindow) {
                mainWindow.show();
            }
        });
    });
}
electron_1.app.on('before-quit', () => {
    isQuitting = true;
});
electron_1.app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => {
        event.preventDefault();
    });
    contents.session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
        if (!ALLOWED_PERMISSION_TYPES.has(permission)) {
            callback(false);
            return;
        }
        const requesterUrl = details?.requestingUrl || _webContents.getURL();
        callback(isAllowedRendererSource(requesterUrl));
    });
    contents.setWindowOpenHandler(({ url }) => {
        if ((0, url_security_1.isSafeExternalUrl)(url)) {
            void electron_1.shell.openExternal(url);
        }
        return { action: 'deny' };
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // On Windows/Linux, keep app running in tray
        if (!store.get('minimizeToTray', true)) {
            electron_1.app.quit();
        }
    }
});
// ============================================
// IPC Handlers - Auth & Config
// ============================================
electron_1.ipcMain.handle('store:get', (_event, key) => {
    if (typeof key !== 'string') {
        throw new Error('Store key must be a string');
    }
    assertStoreKey(key);
    return store.get(key);
});
electron_1.ipcMain.handle('store:set', (_event, key, value) => {
    if (typeof key !== 'string') {
        throw new Error('Store key must be a string');
    }
    assertStoreKey(key);
    // Validate value types to prevent storing functions or other non-serializable data
    if (typeof value === 'function' || typeof value === 'symbol') {
        throw new Error('Store value must be serializable');
    }
    // Guard against excessively large values that could exhaust disk or slow startup
    const MAX_STORE_VALUE_BYTES = 10 * 1024 * 1024; // 10MB
    let serialized;
    try {
        serialized = JSON.stringify(value);
    }
    catch {
        throw new Error('Store value is not serializable');
    }
    if (serialized.length > MAX_STORE_VALUE_BYTES) {
        throw new Error(`Store value too large: ${serialized.length} bytes (max ${MAX_STORE_VALUE_BYTES})`);
    }
    store.set(key, value);
    return true;
});
electron_1.ipcMain.handle('store:delete', (_event, key) => {
    if (typeof key !== 'string') {
        throw new Error('Store key must be a string');
    }
    assertStoreKey(key);
    store.delete(key);
    return true;
});
electron_1.ipcMain.handle('store:clear', () => {
    if (electron_1.app.isPackaged) {
        return false;
    }
    store.clear();
    return true;
});
// ============================================
// IPC Handlers - OAuth Flows
// ============================================
electron_1.ipcMain.handle('oauth:shopify:start', async (_event, shop) => {
    try {
        assertNonEmptyString(shop, 'shop', 255);
        const result = await shopifyOAuth.startAuth(shop);
        mainWindow?.webContents.send('oauth:shopify:success', result);
        return result;
    }
    catch (error) {
        Sentry.captureException(error);
        mainWindow?.webContents.send('oauth:shopify:error', error);
        throw error;
    }
});
electron_1.ipcMain.handle('oauth:gorgias:start', async (_event, domain) => {
    try {
        assertNonEmptyString(domain, 'domain', 255);
        const result = await gorgiasOAuth.startAuth(domain);
        mainWindow?.webContents.send('oauth:gorgias:success', result);
        return result;
    }
    catch (error) {
        Sentry.captureException(error);
        mainWindow?.webContents.send('oauth:gorgias:error', error);
        throw error;
    }
});
electron_1.ipcMain.handle('oauth:zendesk:start', async (_event, subdomain) => {
    try {
        assertNonEmptyString(subdomain, 'subdomain', 255);
        const result = await zendeskOAuth.startAuth(subdomain);
        mainWindow?.webContents.send('oauth:zendesk:success', result);
        return result;
    }
    catch (error) {
        Sentry.captureException(error);
        mainWindow?.webContents.send('oauth:zendesk:error', error);
        throw error;
    }
});
// ============================================
// IPC Handlers - API Key management
// ============================================
electron_1.ipcMain.handle('auth:setApiKey', (_event, apiKey) => {
    assertNonEmptyString(apiKey, 'apiKey', 4096);
    return setSecureValue(apiKey, API_KEY_STORAGE);
});
electron_1.ipcMain.handle('auth:getApiKey', () => {
    return getSecureValue(API_KEY_STORAGE);
});
electron_1.ipcMain.handle('auth:clearApiKey', () => {
    return clearSecureValue(API_KEY_STORAGE);
});
electron_1.ipcMain.handle('auth:isSecureStorageAvailable', () => {
    return electron_1.safeStorage.isEncryptionAvailable();
});
// ============================================
// IPC Handlers - Sandbox API Key management
// ============================================
electron_1.ipcMain.handle('auth:setSandboxApiKey', (_event, apiKey) => {
    assertNonEmptyString(apiKey, 'apiKey', 4096);
    return setSecureValue(apiKey, SANDBOX_KEY_STORAGE);
});
electron_1.ipcMain.handle('auth:getSandboxApiKey', () => {
    return getSecureValue(SANDBOX_KEY_STORAGE);
});
electron_1.ipcMain.handle('auth:clearSandboxApiKey', () => {
    return clearSecureValue(SANDBOX_KEY_STORAGE);
});
// ============================================
// IPC Handlers - Local secrets fallback
// ============================================
electron_1.ipcMain.handle('secrets:setLocal', (_event, payload) => {
    assertNonEmptyString(payload, 'payload', 10 * 1024 * 1024);
    return setSecureValue(payload, LOCAL_SECRETS_STORAGE);
});
electron_1.ipcMain.handle('secrets:getLocal', () => {
    return getSecureValue(LOCAL_SECRETS_STORAGE);
});
electron_1.ipcMain.handle('secrets:clearLocal', () => {
    return clearSecureValue(LOCAL_SECRETS_STORAGE);
});
// ============================================
// IPC Handlers - Window controls
// ============================================
electron_1.ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
});
electron_1.ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    }
    else {
        mainWindow?.maximize();
    }
});
electron_1.ipcMain.handle('window:close', () => {
    mainWindow?.close();
});
// ============================================
// IPC Handlers - App info & Updates
// ============================================
electron_1.ipcMain.handle('app:getVersion', () => {
    return electron_1.app.getVersion();
});
electron_1.ipcMain.handle('app:getPlatform', () => {
    return process.platform;
});
electron_1.ipcMain.handle('app:checkForUpdates', async () => {
    const updaterStatus = getAutoUpdaterStatus();
    if (!updaterStatus.enabled) {
        setUpdateStatusSnapshot({
            status: 'disabled',
            checking: false,
            available: false,
            progress: 0,
            message: updaterStatus.reason || 'Updates disabled in this build',
            error: undefined,
            version: undefined,
        });
        return { available: false, message: updaterStatus.reason || 'Updates disabled in this build' };
    }
    setUpdateStatusSnapshot({
        status: 'checking',
        checking: true,
        available: false,
        progress: 0,
        message: undefined,
        error: undefined,
        version: undefined,
    });
    try {
        const result = await electron_updater_1.autoUpdater.checkForUpdates();
        const version = result?.updateInfo?.version;
        const available = Boolean(version);
        if (available) {
            setUpdateStatusSnapshot({
                status: 'available',
                checking: false,
                available: true,
                progress: 0,
                version,
            });
        }
        else {
            setUpdateStatusSnapshot({
                status: 'idle',
                checking: false,
                available: false,
                progress: 0,
                version: undefined,
            });
        }
        return { available, version };
    }
    catch (error) {
        setUpdateStatusSnapshot({
            status: 'error',
            checking: false,
            error: String(error),
        });
        return { available: false, error: String(error) };
    }
});
electron_1.ipcMain.handle('app:installUpdate', () => {
    if (!getAutoUpdaterStatus().enabled) {
        return false;
    }
    electron_updater_1.autoUpdater.quitAndInstall();
    return true;
});
electron_1.ipcMain.handle('app:getUpdateStatus', () => {
    return updateStatusSnapshot;
});
// ============================================
// IPC Handlers - Background Mode
// ============================================
electron_1.ipcMain.handle('app:setMinimizeToTray', (_event, enabled) => {
    assertBoolean(enabled, 'enabled');
    store.set('minimizeToTray', enabled);
    return true;
});
electron_1.ipcMain.handle('app:getMinimizeToTray', () => {
    return store.get('minimizeToTray', true);
});
electron_1.ipcMain.handle('app:updateAgentStatus', (_event, status) => {
    assertOptionalObject(status, 'status');
    assertSafeCount(status.running, 'status.running', 1000000);
    assertSafeCount(status.total, 'status.total', 1000000);
    if (status.running > status.total) {
        throw new Error('status.running cannot exceed status.total');
    }
    updateTrayStatus(status);
    return true;
});
// ============================================
// IPC Handlers - Notifications
// ============================================
electron_1.ipcMain.handle('app:showNotification', (_event, options) => {
    assertOptionalObject(options, 'options');
    if (typeof options.title !== 'string' || typeof options.body !== 'string') {
        throw new Error('Notification title and body must be strings');
    }
    if (!options.title.trim() || !options.body.trim()) {
        throw new Error('Notification title and body must be non-empty');
    }
    if (options.title.length > 100 || options.body.length > 500) {
        throw new Error('Notification fields exceed maximum lengths');
    }
    // Limit notification content length to prevent abuse
    const MAX_TITLE_LENGTH = 100;
    const MAX_BODY_LENGTH = 500;
    const title = options.title.slice(0, MAX_TITLE_LENGTH);
    const body = options.body.slice(0, MAX_BODY_LENGTH);
    if (electron_1.Notification.isSupported()) {
        new electron_1.Notification({ title, body }).show();
    }
    return true;
});
// ============================================
// Error Handling
// ============================================
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    Sentry.captureException(error);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    Sentry.captureException(reason);
});
