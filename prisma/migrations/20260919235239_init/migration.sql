-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL DEFAULT 'room',
    "title" TEXT NOT NULL,
    "celebrantName" TEXT NOT NULL,
    "age" INTEGER,
    "occasion" TEXT NOT NULL DEFAULT 'birthday',
    "eventAt" DATETIME NOT NULL,
    "timezone" TEXT NOT NULL,
    "bannerText" TEXT NOT NULL DEFAULT 'HAPPY BIRTHDAY!',
    "hostEmail" TEXT NOT NULL,
    "adminTokenHash" TEXT NOT NULL,
    "contributeTokenHash" TEXT NOT NULL,
    "celebrateTokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "paidAt" DATETIME,
    "unlockedAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Box" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "designJson" TEXT NOT NULL,
    "posX" REAL NOT NULL,
    "posY" REAL NOT NULL,
    "z" INTEGER NOT NULL DEFAULT 0,
    "sealedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleteTokenHash" TEXT NOT NULL,
    "openedAt" DATETIME,
    "reportedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Box_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Goodie" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boxId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    CONSTRAINT "Goodie_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boxId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    CONSTRAINT "Asset_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PhotoboothShot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "deleteTokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhotoboothShot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "goodieId" TEXT NOT NULL PRIMARY KEY,
    "redeemedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CouponRedemption_goodieId_fkey" FOREIGN KEY ("goodieId") REFERENCES "Goodie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Room_adminTokenHash_key" ON "Room"("adminTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Room_contributeTokenHash_key" ON "Room"("contributeTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Room_celebrateTokenHash_key" ON "Room"("celebrateTokenHash");

-- CreateIndex
CREATE INDEX "Box_roomId_idx" ON "Box"("roomId");

-- CreateIndex
CREATE INDEX "Goodie_boxId_idx" ON "Goodie"("boxId");

-- CreateIndex
CREATE INDEX "Asset_boxId_idx" ON "Asset"("boxId");

-- CreateIndex
CREATE INDEX "PhotoboothShot_roomId_idx" ON "PhotoboothShot"("roomId");

-- CreateIndex
CREATE INDEX "Payment_roomId_idx" ON "Payment"("roomId");
