// firebase-messaging-sw.js — Background push handler for FCM
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyA9PBWY_Q8T6uWf8z8a7LUEeq3GXKBPICU",
  authDomain:        "pwa-5516b.firebaseapp.com",
  projectId:         "pwa-5516b",
  storageBucket:     "pwa-5516b.firebasestorage.app",
  messagingSenderId: "548974977318",
  appId:             "1:548974977318:web:8aba4a8e9abb0e6f0c61e7",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const title = payload.notification?.title || 'SmartExpense';
  const body  = payload.notification?.body  || '';
  self.registration.showNotification(title, {
    body,
    icon:    '/static/icons/icon-192.png',
    badge:   '/static/icons/icon-192.png',
    vibrate: [200, 100, 200],
    tag:     'smartexpense',
  });
});
