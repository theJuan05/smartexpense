// static/firebase.js
const firebaseConfig = {
  apiKey: "AIzaSyA9PBWY_Q8T6uWf8z8a7LUEeq3GXKBPICU",
  authDomain: "pwa-5516b.firebaseapp.com",
  projectId: "pwa-5516b",
  storageBucket: "pwa-5516b.firebasestorage.app",
  messagingSenderId: "548974977318",
  appId: "1:548974977318:web:8aba4a8e9abb0e6f0c61e7",
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

async function requestNotificationPermission() {
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const token = await messaging.getToken({
        vapidKey: "BOfZ497Sgq7gruzFLTrEnJmWlq8jmUypT_4SCuW9G44YK_tSAjcxmPHiT3izs1aeYKANmCfIr89pf4DKhKbJ_QI", 
      });
      console.log("FCM Token:", token);
      // TODO: send this token to your Flask backend
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

// Handle foreground notifications
messaging.onMessage((payload) => {
  alert(`${payload.notification.title}: ${payload.notification.body}`);
});

requestNotificationPermission();