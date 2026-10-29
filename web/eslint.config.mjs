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
  // #654: dialogs go through ResponsiveModal, which turns them into a
  // full-screen sheet on phones (ux-ui.md §5.4). Six plain `Modal`s had
  // slipped past the #328 migration with nothing to catch them.
  {
    files: ['**/*.{ts,tsx}'],
    ignores: [
      'components/ui/ResponsiveModal.tsx', // the wrapper itself
      'components/ui/BottomNav.tsx', // the "More" menu is a bottom sheet on purpose, never full-screen
      '**/__tests__/**', // test doubles of @heroui/react
    ],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: '@heroui/react',
          importNames: ['Modal'],
          message: 'Use ResponsiveModal from @/components/ui/ResponsiveModal: it opens full-screen on phones (ux-ui.md §5.4).',
        }],
      }],
    },
  },
];

export default eslintConfig;
