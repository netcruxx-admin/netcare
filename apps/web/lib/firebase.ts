import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialise once, re-use on hot reloads
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/**
 * Returns the Messaging instance, or null on unsupported browsers
 * (Safari < 16.4 / non-HTTPS / service-worker blocked).
 */
export async function getFirebaseMessaging() {
  if (!(await isSupported())) return null;
  return getMessaging(app);
}
