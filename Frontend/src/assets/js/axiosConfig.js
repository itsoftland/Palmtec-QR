import axios from 'axios';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;

const isLocalNetworkHost = (host) => {
    if (!host) return false;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
    if (host.startsWith('192.168.') || host.startsWith('10.')) return true;

    const parts = host.split('.').map(Number);
    return (
        parts.length === 4 &&
        parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) &&
        parts[0] === 172 &&
        parts[1] >= 16 &&
        parts[1] <= 31
    );
};

const resolveBaseUrl = (url) => {
    if (!url || typeof window === 'undefined') return url;

    try {
        const parsed = new URL(url);
        const currentHost = window.location.hostname;

        if (
            parsed.protocol === window.location.protocol &&
            parsed.hostname !== currentHost &&
            isLocalNetworkHost(parsed.hostname) &&
            isLocalNetworkHost(currentHost)
        ) {
            parsed.hostname = currentHost;
        }

        return parsed.toString().replace(/\/$/, '');
    } catch {
        return url;
    }
};

const BASE_URL = resolveBaseUrl(configuredBaseUrl);

// ── Pending request tracking ──────────────────────────────────────────────────
const pendingControllers = new Set();

export const cancelAllPendingRequests = () => {
    pendingControllers.forEach(c => c.abort());
    pendingControllers.clear();
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const clearSessionAndRedirect = (message) => {
    localStorage.removeItem('user');
    localStorage.removeItem('session_timeout_seconds');
    const base = import.meta.env.BASE_URL;
    const dest = message
        ? `${base}login?error=${encodeURIComponent(message)}`
        : `${base}login`;
    window.location.href = dest;
};

// ── Main API instance ─────────────────────────────────────────────────────────
// withCredentials sends the pqr_session HttpOnly cookie automatically.
// No Authorization header, no token storage, no refresh cycle.
const api = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
});

// Track AbortControllers for every request except logout
// so cancelAllPendingRequests() can cancel in-flight calls on logout/session expiry.
api.interceptors.request.use((config) => {
    if (config.url?.includes('/logout')) return config;
    const controller = new AbortController();
    config.signal = controller.signal;
    config._controller = controller;
    pendingControllers.add(controller);
    return config;
});

api.interceptors.response.use(
    (response) => {
        if (response.config._controller) {
            pendingControllers.delete(response.config._controller);
        }
        return response;
    },
    (error) => {
        if (error.config?._controller) {
            pendingControllers.delete(error.config._controller);
        }

        // Drop silently — cancelled by cancelAllPendingRequests
        if (axios.isCancel(error) || error.name === 'CanceledError') {
            return Promise.reject(error);
        }

        // Never intercept auth/session endpoints — let the calling code handle errors.
        // /verify-auth is handled by the idle timer's onSessionInvalid callback.
        if (
            error.config?.url?.includes('/login') ||
            error.config?.url?.includes('/logout') ||
            error.config?.url?.includes('/verify-auth')
        ) {
            return Promise.reject(error);
        }

        const httpStatus = error.response?.status;

        if (httpStatus === 401) {
            // Session expired or invalid — redirect to login immediately.
            // No refresh retry: the opaque session is either alive or dead.
            clearSessionAndRedirect();
            return Promise.reject(error);
        }

        if (httpStatus === 403) {
            // License expired, account deactivated, or force-logged-out by admin.
            const message =
                error.response?.data?.detail ||
                error.response?.data?.error ||
                'Access forbidden.';
            clearSessionAndRedirect(message);
            return Promise.reject(error);
        }

        return Promise.reject(error);
    }
);

export default api;
export { BASE_URL };
