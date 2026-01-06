// Backward compatibility layer.
//
// The codebase migrated from "caves" to "cellars". We keep this module so:
// - the TypeScript build remains green (legacy imports don't break)
// - external consumers (or old compiled code) can still import `createCavesRouter`
//
// In `src/index.ts` we already mount `/api/caves` as an alias to the same router.

export { createCellarsRouter as createCavesRouter } from "./cellars.js";
export { CellarService as CaveService } from "../services/cellars.js";
