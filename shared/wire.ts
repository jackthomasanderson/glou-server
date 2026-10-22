/**
 * #466: a contract as the web receives it. Contracts are declared the way the
 * API builds them (dates as Date); res.json() turns every Date into an ISO
 * 8601 string, recursively.
 */
export type Wire<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;
