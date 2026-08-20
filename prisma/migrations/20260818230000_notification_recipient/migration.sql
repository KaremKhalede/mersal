-- Per-recipient WhatsApp routing: a notification is now addressed to a specific party (the sending
-- customer or the receiver at the destination), not implicitly to the customer.
--
-- Existing rows were all sent to the customer's number, so CUSTOMER is the historically correct
-- backfill value and the column default at once — no data is reinterpreted.
ALTER TABLE "NotificationLog" ADD COLUMN "recipient" TEXT NOT NULL DEFAULT 'CUSTOMER';

-- The idempotency key widens from (trackingEventId) to (trackingEventId, recipient). One state
-- transition can legitimately produce two messages to two different people; the old single-column
-- unique would have rejected the second as a duplicate. Per party, the guarantee is unchanged:
-- a retried dispatch for the same occurrence and the same recipient still collides and is skipped.
DROP INDEX "NotificationLog_trackingEventId_key";
CREATE UNIQUE INDEX "NotificationLog_trackingEventId_recipient_key" ON "NotificationLog"("trackingEventId", "recipient");
