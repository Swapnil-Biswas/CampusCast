// CampusCast service worker: shows browser push alerts and opens the right page when tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "CampusCast", body: event.data?.text() || "" }; }
  const urgent = Number(d.urgency) <= 1;
  event.waitUntil(self.registration.showNotification(d.title || "CampusCast", {
    body: d.body || "",
    tag: d.url || "campuscast",
    renotify: urgent,
    requireInteraction: Number(d.urgency) === 0,
    vibrate: urgent ? [120, 60, 120] : undefined,
    data: { url: d.url || "/dashboard" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if ("focus" in c) { c.navigate?.(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
