// static/firebase-messaging-sw.js
importScripts("https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA9PBWY_Q8T6uWf8z8a7LUEeq3GXKBPICU",
  authDomain: "pwa-5516b.firebaseapp.com",
  projectId: "pwa-5516b",
  storageBucket: "pwa-5516b.firebasestorage.app",
  messagingSenderId: "548974977318",
  appId: "1:548974977318:web:8aba4a8e9abb0e6f0c61e7",
});

const messaging = firebase.messaging();

// This handles notifications when your app is in the BACKGROUND or CLOSED
messaging.onBackgroundMessage((payload) => {
  console.log("Background message received:", payload);

  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: "/static/icon.png", // optional, change to your app icon path
  });
});