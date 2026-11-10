// i18next 27 turns on `strictInterpolationChecks` in its types by default.
// Many helpers receive `t` through a local alias
// `(key: string, options?: Record<string, unknown>) => string`, which is no
// longer assignable to the strict `TFunction`. Keep the previous, lenient
// behaviour until those aliases are replaced by `TFunction`.
import 'i18next';

declare module 'i18next' {
  interface CustomTypeOptions {
    strictInterpolationChecks: false;
  }
}
