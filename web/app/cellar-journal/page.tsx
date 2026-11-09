'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// #502: the tastings page lives at /tastings again. Browsers cached the old
// permanent redirect /tastings -> /cellar-journal, so an HTTP redirect back
// would loop (ERR_TOO_MANY_REDIRECTS). This client-side hop is not cached.
export default function CellarJournalRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/tastings${window.location.search}${window.location.hash}`);
  }, [router]);
  return null;
}
