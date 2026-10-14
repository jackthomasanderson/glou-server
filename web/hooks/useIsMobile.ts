import { useSyncExternalStore } from 'react';

// ux-ui.md §4.5 / §5.4: modals switch to a full-screen bottom sheet below
// this breakpoint. useSyncExternalStore (rather than useState+useEffect+
// matchMedia-listener) avoids a setState-in-effect and gives the SSR
// default (desktop) for free.
const MOBILE_QUERY = '(max-width: 767px)';

function subscribe(callback: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
