/* global clients, self */

self.addEventListener("notificationclick", (event) => {
  if (!event.notification.tag.startsWith("planner:")) return;
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL("/#calendar", self.location.origin);
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const planner = windows.find((client) => {
      const url = new URL(client.url);
      return url.origin === target.origin && url.pathname === target.pathname;
    });
    if (planner) {
      await planner.focus();
      if (planner.url !== target.href) await planner.navigate(target.href);
    } else {
      await clients.openWindow(target.href);
    }
  })());
});
