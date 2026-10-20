import { BottleCategory } from '@prisma/client';
import { z } from 'zod';

// ISSUE_137: the wine/sparkling/spirit/cigar category list was hand-copied
// into 9 independent `z.enum([...])` calls across api/src — adding a
// category meant remembering every one of them. Prisma's `BottleCategory`
// enum (schema.prisma) is the single source of truth; every schema that
// validates a category derives from it instead.
export const CATEGORY_VALUES = Object.values(BottleCategory) as [BottleCategory, ...BottleCategory[]];

export const categorySchema = z.enum(CATEGORY_VALUES);
