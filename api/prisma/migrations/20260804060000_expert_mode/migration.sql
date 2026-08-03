-- Data-model audit (Task 1): "Mode expert / collectionneur" toggle. Same
-- personal-preference pattern as theme/language/tempUnit — OFF by default so
-- the app stays approachable for the general-public default use case.
-- Advanced/collector sections (wine tasting grid, spirit cask fields, cigar
-- humidor monitoring — Tasks 2/3/4) are only rendered client-side when this
-- flag is true (see web/hooks/useExpertMode.ts).

ALTER TABLE "User" ADD COLUMN "expertMode" BOOLEAN NOT NULL DEFAULT false;
