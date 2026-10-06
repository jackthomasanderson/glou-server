import type { MetadataRoute } from 'next';

// Glou is a private, self-hosted app: nothing in it is meant to be indexed,
// including the public guest-share links (`/guest/<token>`) which are reachable
// without authentication by design (#209). `robots.txt` is only a convention;
// the `X-Robots-Tag` header set in next.config.mjs is the enforced half.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  };
}
