// Firebase Messaging Service Worker
// This file MUST live at /public/firebase-messaging-sw.js so the browser can
// register it at the root scope (/firebase-messaging-sw.js).

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// These values are safe to embed — they are already public in the browser bundle.
firebase.initializeApp({
  apiKey: 'AIzaSyD8IGV0HYQkkglzRp7bsSccZAk7XOOnfvo',
  authDomain: 'netcare-5dd8e.firebaseapp.com',
  projectId: 'netcare-5dd8e',
  messagingSenderId: '501595052211',
  appId: '1:501595052211:web:b342977843e429febdb8c6',
});

const messaging = firebase.messaging();

// Handle background messages (app is closed or in another tab).
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  self.registration.showNotification(title ?? 'NetCare', {
    body: body ?? '',
    icon: '/logo/logo-icon.png',
    badge: '/logo/logo-icon.png',
    data: payload.data,
  });
});
