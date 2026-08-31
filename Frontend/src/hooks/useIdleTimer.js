/**
 * useIdleTimer
 * ============
 * Tracks user interaction and manages the session idle timeout on the frontend.
 *
 * Behaviour:
 *  - While the user is active: sends a keepalive to the server at most once
 *    per keepaliveIntervalMs (default 5 min). Resets the local idle clock.
 *  - At (timeout - warningBeforeSeconds) of inactivity: fires onWarn().
 *  - At timeout ms of inactivity: fires onTimeout() — caller should log out.
 *  - Page Visibility API: pauses idle checks while the tab is hidden.
 *    On tab becoming visible again, calls verify-auth to confirm session is
 *    still alive — if the session expired while the tab was in the background,
 *    onSessionInvalid() is fired immediately.
 *
 * Props:
 *  sessionTimeoutSeconds  — from login / verify-auth response (default: 1200)
 *  warningBeforeSeconds   — seconds before timeout to call onWarn (default: 180 = 3 min)
 *  keepaliveIntervalMs    — max rate of server keepalive pings (default: 300000 = 5 min)
 *  onWarn()               — show "still there?" prompt
 *  onTimeout()            — idle timeout reached, log out
 *  onSessionInvalid()     — tab refocused but session already expired server-side
 *  enabled                — set false on login / public pages
 *
 * Returns:
 *  { extendSession }      — call this when the user clicks "Keep Using"
 */

import { useEffect, useRef, useCallback } from 'react';
import api from '../assets/js/axiosConfig';

const ACTIVITY_EVENTS = [
    'mousemove', 'mousedown', 'keydown',
    'touchstart', 'scroll', 'click', 'wheel',
];

export function useIdleTimer({
    sessionTimeoutSeconds,
    warningBeforeSeconds = 180,
    keepaliveIntervalMs = 300_000,
    onWarn,
    onTimeout,
    onSessionInvalid,
    enabled = true,
}) {
    const idleTimeout   = (sessionTimeoutSeconds ?? 1200) * 1000;
    const warnThreshold = idleTimeout - warningBeforeSeconds * 1000;

    const lastActivityRef  = useRef(Date.now());
    const lastKeepaliveRef = useRef(Date.now());
    const warnFiredRef     = useRef(false);
    const checkIntervalRef = useRef(null);

    // Called on every user interaction event.
    // Resets the idle clock and sends a keepalive if enough time has passed.
    const resetActivity = useCallback(() => {
        lastActivityRef.current = Date.now();
        warnFiredRef.current = false;

        const now = Date.now();
        if (now - lastKeepaliveRef.current >= keepaliveIntervalMs) {
            lastKeepaliveRef.current = now;
            api.post('/session/keepalive').catch(() => {
                // Keepalive failure means session is likely dead.
                // The next regular request will 401 and trigger redirect.
            });
        }
    }, [keepaliveIntervalMs]);

    // Exported: call this when the user clicks "Keep Using" in the warning modal.
    // Sends an immediate keepalive and fully resets the idle clock.
    const extendSession = useCallback(() => {
        lastActivityRef.current  = Date.now();
        lastKeepaliveRef.current = Date.now();
        warnFiredRef.current     = false;
        api.post('/session/keepalive').catch(() => {});
    }, []);

    useEffect(() => {
        if (!enabled) return;

        // Attach interaction listeners
        ACTIVITY_EVENTS.forEach(evt =>
            window.addEventListener(evt, resetActivity, { passive: true })
        );

        // Poll every 10 seconds to check idle state.
        // Skips check while tab is hidden — no point warning an invisible tab.
        checkIntervalRef.current = setInterval(() => {
            if (document.hidden) return;

            const idle = Date.now() - lastActivityRef.current;

            if (idle >= idleTimeout) {
                onTimeout?.();
                return;
            }

            if (idle >= warnThreshold && !warnFiredRef.current) {
                warnFiredRef.current = true;
                onWarn?.();
            }
        }, 10_000);

        // Page Visibility: when the tab becomes visible again after being hidden,
        // check with the server that the session is still alive.
        // If the user left the tab idle for longer than the session TTL, the
        // server session will have expired — fire onSessionInvalid immediately
        // rather than waiting for the next API call to fail.
        const handleVisibility = () => {
            if (!document.hidden) {
                api.get('/verify-auth').catch((err) => {
                    if (err.response?.status === 401 || err.response?.status === 403) {
                        onSessionInvalid?.();
                    }
                });
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            ACTIVITY_EVENTS.forEach(evt =>
                window.removeEventListener(evt, resetActivity)
            );
            clearInterval(checkIntervalRef.current);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [enabled, idleTimeout, warnThreshold, resetActivity, onWarn, onTimeout, onSessionInvalid]);

    return { extendSession };
}
