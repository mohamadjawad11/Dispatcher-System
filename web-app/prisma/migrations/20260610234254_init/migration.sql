-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DISPATCHED', 'IN_TRANSIT', 'HALTED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('VEHICLE_ISSUE', 'CUSTOMER_ABSENT', 'WEATHER');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('TRIAGE', 'ACTIONING', 'RESOLVED');

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "destinationCity" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DISPATCHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exception" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "category" "Category" NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'TRIAGE',
    "rawInput" TEXT NOT NULL,
    "actionPlan" TEXT NOT NULL,
    "notificationText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "exceptionId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldState" TEXT,
    "newState" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL DEFAULT 'Dispatcher_System',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_trackingNumber_key" ON "Shipment"("trackingNumber");

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "Exception"("id") ON DELETE SET NULL ON UPDATE CASCADE;
