// #979: preloaded in front of Next's standalone server (`node --import`, see
// the Dockerfile) so X-Forwarded-For carries one address web trusts before
// Next proxies /api to the API. TRUSTED_PROXY_HOPS: reverse proxies in front
// of web (default 1; 0 when web is exposed directly).
import { installClientAddress, trustedProxyHops } from './lib/client-address.mjs';

installClientAddress(trustedProxyHops(process.env.TRUSTED_PROXY_HOPS));
