/**
 * `fetch` got no answer at all: offline, DNS failure, server down. Still a
 * TypeError, as `fetch` itself throws, so callers that queue work offline on
 * a TypeError keep working; the subclass tells it apart from a TypeError
 * raised by a bug in our own code (#582, #640).
 */
export class NetworkError extends TypeError {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Network request failed', { cause });
    this.name = 'NetworkError';
  }
}

/** `fetch`, with a request that got no answer rethrown as a NetworkError. Timeouts and aborts are left as they are. */
export async function fetchOrNetworkError(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    if (err instanceof TypeError) throw new NetworkError(err);
    throw err;
  }
}
