// ua-parser-js@1.0.39 declares "types": "src/main/ua-parser.d.ts" in its package.json,
// but that path does not exist in the published package (only "main": "src/ua-parser.js" does) —
// a real packaging bug in that release. TypeScript then falls back to implicit `any`, which fails
// under `strict`/`noImplicitAny` in CI (works locally only because of stale/cached resolution).
// `@types/ua-parser-js` on npm is stuck at 0.7.x (the old functional API) and would be a worse
// mismatch than no types at all, since we use the 1.x class API (`new UAParser(ua).getResult()`).
// Minimal ambient declaration covering only what this project actually uses.
declare module 'ua-parser-js' {
  interface UAParserResult {
    browser: { name?: string; version?: string };
    os: { name?: string; version?: string };
    device: { vendor?: string; model?: string; type?: string };
    engine: { name?: string; version?: string };
    cpu: { architecture?: string };
  }

  export class UAParser {
    constructor(userAgent?: string);
    getResult(): UAParserResult;
    getBrowser(): UAParserResult['browser'];
    getOS(): UAParserResult['os'];
    getDevice(): UAParserResult['device'];
    getEngine(): UAParserResult['engine'];
    getCPU(): UAParserResult['cpu'];
  }
}
