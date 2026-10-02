import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // instructions.md: "TypeScript strict obligatoire (aucun `any` toléré)".
      '@typescript-eslint/no-explicit-any': 'error',
      // Namespace augmentation (`declare global { namespace Express { ... } }`)
      // is the standard, idiomatic way to extend Express's Request type —
      // not the kind of namespace usage this rule is meant to discourage.
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // Tolerates the historical `catch (err)` / `catch (error)` spelling where
          // the binding is left unused, plus explicit `_`-prefixed names. This is
          // a transitional allowance, NOT a statement that such errors are handled
          // elsewhere: a catch block that neither logs the error nor forwards it to
          // `errorMiddleware` is a bug (ISSUE_063). New code should either let the
          // error bubble up (Express 5 forwards rejected handler promises to the
          // global handler) or call `next(error)`.
          caughtErrorsIgnorePattern: '^_|^e(rr(or)?)?$',
        },
      ],
    },
  },
  {
    // Test mocks routinely need to shape-shift around Prisma's generated
    // client types (fluent/thenable return types that a plain mock can't
    // structurally satisfy) — `any` here is scaffolding, not application
    // logic, so the strict app-code rule doesn't apply.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Same rationale as tests/**: seed.ts spreads heterogeneous literal
    // fixture objects (wines/spirits/cigars with different field shapes)
    // into Prisma's generated `create` input types, which a plain object
    // literal can't structurally satisfy. Fixture scaffolding, not app logic.
    files: ['prisma/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
