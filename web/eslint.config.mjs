import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// `next lint` was removed in Next.js 16 (see CI run #174 — it now misparses
// "lint" as a positional project-directory arg), so ESLint is invoked
// directly via the "lint": "eslint ." script instead. eslint-config-next 16
// already ships native ESLint 9 flat-config arrays (no FlatCompat bridging
// needed — wrapping these already-flat configs in FlatCompat double-wraps
// the plugin objects and crashes with a circular-structure error).
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ['node_modules/**', '.next/**', 'public/**'],
  },
];

export default eslintConfig;
