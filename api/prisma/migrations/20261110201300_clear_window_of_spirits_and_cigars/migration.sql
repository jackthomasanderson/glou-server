-- #593: a spirit or a cigar has no drinking window (the form only offers one
-- for wine and sparkling wine). One first saved as a wine kept the window it
-- was given then: invisible and impossible to remove, it still fed the
-- alerts, the peak e-mails, the consumption plan, the readiness gauge and the
-- cellar-keeping chart. From now on a family's window is cleared when it
-- becomes a spirit or a cigar; this clears the ones left from before.
-- Only these columns of these families are written: the bottles, their number
-- included, are untouched, and `updatedAt` does not move (not a member's edit).
UPDATE "products"
SET "peakMaturityFrom" = NULL,
    "peakMaturityTo" = NULL,
    "curveShape" = NULL,
    "alertStatus" = 'none'
WHERE "category" IN ('spirit', 'cigar')
  AND ("peakMaturityFrom" IS NOT NULL OR "peakMaturityTo" IS NOT NULL OR "curveShape" IS NOT NULL);
