// firebase.js — Firebase Cloud Messaging integration

const firebaseConfig = {
  apiKey:            "AIzaSyA9PBWY_Q8T6uWf8z8a7LUEeq3GXKBPICU",
  authDomain:        "pwa-5516b.firebaseapp.com",
  projectId:         "pwa-5516b",
  storageBucket:     "pwa-5516b.firebasestorage.app",
  messagingSenderId: "548974977318",
  appId:             "1:548974977318:web:8aba4a8e9abb0e6f0c61e7",
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Called by app.js after notification permission is granted.
// Gets the FCM device token and saves it to the Flask backend.
async function initFirebaseMessaging() {
  if (typeof messaging === 'undefined') return;
  try {
    // Register the Firebase SW separately so it doesn't conflict with the main
    // service-worker.js that handles caching + local push notifications.
    const fbReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await messaging.getToken({
      vapidKey:                  "BOfZ497Sgq7gruzFLTrEnJmWlq8jmUypT_4SCuW9G44YK_tSAjcxmPHiT3izs1aeYKANmCfIr89pf4DKhKbJ_QI",
      serviceWorkerRegistration: fbReg,
    });

    if (!token) {
      console.warn('[FCM] No token returned — SW or VAPID issue');
      return;
    }

    console.log('[FCM] Token obtained, saving to server...');
    const res = await fetch('/api/push-token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token }),
    });
    const data = await res.json();
    if (data.status === 'success') {
      console.log('[FCM] Token registered with server ✅');
    }
  } catch (err) {
    console.warn('[FCM] Init error:', err.message || err);
  }
}

// When app is in the FOREGROUND, Firebase intercepts the push and
// fires onMessage instead of showing a system notification.
// Show a toast so the user still sees the alert.
messaging.onMessage((payload) => {
  const title = payload.notification?.title || 'SmartExpense';
  const body  = payload.notification?.body  || '';
  if (typeof showToast === 'function') {
    showToast(`${title}: ${body}`, 'warning');
  }
});
