/** New Astro pages can be reached through a cache miss while the former root
 * Chirpy worker still controls later navigation. Ask only that registration to
 * download its retirement script; clean visits never install a worker.
 */
export async function retireLegacyWorker() {
  if (!('serviceWorker' in navigator)) return;
  const origin = location.origin;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      if (registration.scope !== origin + '/') continue;
      const workers = [registration.active, registration.waiting, registration.installing];
      if (!workers.some(worker => {
        if (!worker) return false;
        const url = new URL(worker.scriptURL);
        return url.origin === origin && url.pathname === '/sw.min.js';
      })) continue;
      await registration.update();
    }
  } catch {
    // Offline/blocked update must not interrupt reading or scene startup.
    // The next online visit retries through the browser's normal update path.
  }
}
