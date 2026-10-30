-- CreateEnum
CREATE TYPE "VaultStatus" AS ENUM ('UNCONFIGURED', 'ACTIVE', 'REVOKED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('GUARD_SETUP', 'INHERITANCE_EXECUTED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vault" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "timeoutDuration" INTEGER NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "status" "VaultStatus" NOT NULL DEFAULT 'UNCONFIGURED',
    "lastPingAt" TIMESTAMP(3),
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beneficiary" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "bpsShare" INTEGER NOT NULL,
    "email" TEXT,
    "hasBeenNotified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "eventType" "NotificationEvent" NOT NULL,
    "eventTxHash" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Owner_walletAddress_key" ON "Owner"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Vault_ownerId_key" ON "Vault"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Vault_txHash_key" ON "Vault"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "Beneficiary_vaultId_position_key" ON "Beneficiary"("vaultId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Beneficiary_vaultId_walletAddress_key" ON "Beneficiary"("vaultId", "walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_eventType_eventTxHash_recipientEmail_key" ON "NotificationLog"("eventType", "eventTxHash", "recipientEmail");

-- AddForeignKey
ALTER TABLE "Vault" ADD CONSTRAINT "Vault_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

