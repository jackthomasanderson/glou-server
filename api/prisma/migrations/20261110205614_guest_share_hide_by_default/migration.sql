-- #611: a guest link hides purchase prices, values and personal notes unless its owner
-- shows them, in the database as in the API schema and the web form.
-- Existing links are left as they are: each one holds the choice made when it was
-- created (the form's switches have been on by default since #426), and changing it
-- now would silently change what guests already holding the link can see.
ALTER TABLE "guest_shares" ALTER COLUMN "hidePrices" SET DEFAULT true;
ALTER TABLE "guest_shares" ALTER COLUMN "hideNotes" SET DEFAULT true;
