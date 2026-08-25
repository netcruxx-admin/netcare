'use client';

import { useEffect, useRef } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { getFirebaseMessaging } from '@/lib/firebase';
import { useRegisterFcmTokenMutation, useUnregisterFcmTokenMutation } from '@/store/api';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

/**
 * Requests notification permission, obtains an FCM token, and registers it
 * with the backend.  Cleans up (unregisters) when the component unmounts —
 * in practice that only happens on logout, which is exactly when we want to
 * stop delivering pushes to this browser.
 *
 * Mount this hook once, inside DashboardShell, so it runs for every
 * authenticated user automatically.
 */
export function useNotifications() {
  const [registerToken] = useRegisterFcmTokenMutation();
  const [unregisterToken] = useUnregisterFcmTokenMutation();
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    async function setup() {
      // Service workers require HTTPS (or localhost).
      if (typeof window === 'undefined' || !('Notification' in window)) return;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const messaging = await getFirebaseMessaging();
      if (!messaging) return;

      // Register the service worker explicitly so Firebase uses our file.
      const registration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js',
        { scope: '/' }
      );

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (!token) return;

      tokenRef.current = token;
      await registerToken({ token, device_label: navigator.userAgent.slice(0, 200) });

      // Handle foreground messages (app is open and focused).
      unsubscribe = onMessage(messaging, (payload) => {
        const { title, body } = payload.notification ?? {};
        if (Notification.permission === 'granted') {
          new Notification(title ?? 'NetCare', {
            body: body ?? '',
            icon: '/logo/logo-icon.png',
          });
        }
      });
    }

    setup().catch(console.error);

    return () => {
      unsubscribe?.();
      // Unregister on unmount (logout) so pushes stop.
      if (tokenRef.current) {
        unregisterToken({ token: tokenRef.current, device_label: '' }).catch(() => {});
        tokenRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
