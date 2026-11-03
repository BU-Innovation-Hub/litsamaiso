import posthog from 'posthog-js';

const LAST_RELOAD_KEY = 'chunkReloadAt';
const RELOAD_COOLDOWN_MS = 30_000;
const VISIBLE_KEY = 'pageVisible';

// Chrome only: approximate RAM in GB, undefined on Safari and Firefox
export const deviceMemoryGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

let isReloading = false;

export const isReloadingForNewBuild = () => isReloading;

const reloadForNewBuild = () => {
  if (navigator.onLine === false) return;
  try {
    const lastReloadAt = Number(sessionStorage.getItem(LAST_RELOAD_KEY));
    if (Date.now() - lastReloadAt < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
  } catch {
    // Without storage a reload can't be limited, so leave it to the error screen's button
    return;
  }
  isReloading = true;
  window.location.reload();
};

// A deploy replaces the hashed chunks, so a tab still on the old build can't load its next page.
// A reload picks up the new build; the cooldown stops a chunk that really is missing from looping.
// The error isn't prevented: the boundary needs it, and it shows a spinner while the reload starts.
export const installChunkRecovery = () => {
  window.addEventListener('vite:preloadError', reloadForNewBuild);
};

const markVisibility = () => {
  try {
    if (document.visibilityState === 'visible') {
      sessionStorage.setItem(VISIBLE_KEY, '1');
    } else {
      sessionStorage.removeItem(VISIBLE_KEY);
    }
  } catch {
    // Storage can be unavailable on some mobile WebKit contexts.
  }
};

const clearVisibility = () => {
  try {
    sessionStorage.removeItem(VISIBLE_KEY);
  } catch {
    // Storage can be unavailable on some mobile WebKit contexts.
  }
};

// When the OS kills a tab ("Aw, Snap!", Safari's "A problem repeatedly occurred") no JavaScript runs,
// so it can't be reported as it happens. The flag is only set while on screen and is cleared on the way
// out, so finding it on load means this tab died while being used.
export const trackPageCrashes = () => {
  try {
    if (sessionStorage.getItem(VISIBLE_KEY)) {
      posthog.capture('page_crash_suspected', {
        path: window.location.pathname,
        deviceMemoryGb,
      });
    }
  } catch {
    // Storage can be unavailable on some mobile WebKit contexts.
  }

  markVisibility();
  document.addEventListener('visibilitychange', markVisibility);
  window.addEventListener('pageshow', markVisibility);
  window.addEventListener('pagehide', clearVisibility);
};
