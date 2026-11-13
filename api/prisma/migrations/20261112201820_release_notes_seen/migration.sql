-- FEAT-115 (#990): what each administrator has already seen of the release
-- notes ("What's New?" window). No data change: existing accounts start with
-- nothing seen, so their administrators see the notes of this update once.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSeenReleaseVersion" TEXT,
ADD COLUMN     "seenReleaseNoteIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
