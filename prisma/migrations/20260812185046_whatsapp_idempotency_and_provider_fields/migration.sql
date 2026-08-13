-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "providerError" TEXT,
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "trackingEventId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_trackingEventId_key" ON "NotificationLog"("trackingEventId");
