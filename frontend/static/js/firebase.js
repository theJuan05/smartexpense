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

// Called after notification permission is granted.
// Returns true if FCM token was successfully saved to the server.
async function initFirebaseMessaging() {
  if (typeof messaging === 'undefined') {
    console.warn('[FCM] messaging not defined — Firebase SDK may not be loaded');
    return false;
  }
  try {
    const fbReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await messaging.getToken({
      vapidKey:                  "BOfZ497Sgq7gruzFLTrEnJmWlq8jmUypT_4SCuW9G44YK_tSAjcxmPHiT3izs1aeYKANmCfIr89pf4DKhKbJ_QI",
      serviceWorkerRegistration: fbReg,
    });

    if (!token) {
      console.warn('[FCM] No token returned — VAPID key or SW issue');
      return false;
    }

    console.log('[FCM] Token obtained, saving to server...');
    const res  = await fetch('/api/v1/push-token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token }),
    });
    const data = await res.json();
    if (data.status === 'success') {
      console.log('[FCM] Token registered with server ✅');
      return true;
    }
    console.warn('[FCM] Server rejected token:', data.message);
    return false;
  } catch (err) {
    console.warn('[FCM] Init error:', err.message || err);
    return false;
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
