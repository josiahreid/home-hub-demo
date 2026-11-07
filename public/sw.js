// Home Hub's service worker: shows push notifications and opens the right page when one is tapped.
// It doesn't cache anything – Home Hub always loads fresh from the server.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = { title: "Home Hub", body: "" };
  try {
    msg = event.data ? event.data.json() : msg;
  } catch {
    msg.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(msg.title || "Home Hub", {
      body: msg.body || "",
      tag: msg.tag,
      renotify: !!msg.tag,
      data: { url: msg.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.location.origin));
      if (open) {
        open.focus();
        return open.navigate(url);
      }
      return self.clients.openWindow(url);
    }),
  );
});
