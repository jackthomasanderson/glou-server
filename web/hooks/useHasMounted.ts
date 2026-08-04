import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

// useSyncExternalStore (rather than useState+useEffect) is React's own
// sanctioned way to answer "has this component mounted on the client yet":
// it returns the server snapshot (false) during SSR and the initial client
// render, then automatically triggers the same post-hydration re-render the
// old effect-based version relied on to flip to the client snapshot (true).
export function useHasMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}
