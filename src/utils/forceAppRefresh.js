import { isLocalDev } from './domain';

const REFRESH_FLAGS = ['chunk_error_reloaded', 'retry_lazy_reload'];

/** Clear deployment retry flags so the next load can attempt a clean boot. */
export function clearAppRefreshFlags() {
  REFRESH_FLAGS.forEach((key) => sessionStorage.removeItem(key));
}

/** Remove service workers and caches (used on localhost to avoid SW/HMR conflicts). */
export async function clearServiceWorkersAndCaches() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (err) {
    console.warn('[forceAppRefresh] cache clear failed:', err);
  }

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
  } catch (err) {
    console.warn('[forceAppRefresh] service worker unregister failed:', err);
  }
}

function cacheBustReload() {
  window.location.reload(true);
}

/**
 * Hard refresh after deploys: clear stale caches, activate waiting SW, reload.
 * Used by the update banner, lazy chunk retry, and the error fallback screen.
 */
export async function forceAppRefresh({ clearFlags = true } = {}) {
  if (clearFlags) clearAppRefreshFlags();

  if (isLocalDev()) {
    await clearServiceWorkersAndCaches();
    cacheBustReload();
    return;
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (err) {
    console.warn('[forceAppRefresh] cache clear failed:', err);
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    }
  } catch (err) {
    console.warn('[forceAppRefresh] service worker activation failed:', err);
  }

  cacheBustReload();
}
