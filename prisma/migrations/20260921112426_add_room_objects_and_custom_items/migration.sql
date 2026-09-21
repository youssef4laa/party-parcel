-- CreateTable
CREATE TABLE "RoomObject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "spriteKey" TEXT,
    "assetId" TEXT,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "z" INTEGER NOT NULL DEFAULT 0,
    "scale" REAL NOT NULL DEFAULT 1,
    "flipX" BOOLEAN NOT NULL DEFAULT false,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "zone" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdByRole" TEXT NOT NULL,
    "createdBySessionHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoomObject_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomObject_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "CustomItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "createdByRole" TEXT NOT NULL,
    "createdBySessionHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Room" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "permissionsJson" TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO "new_Room" ("adminTokenHash", "age", "bannerText", "celebrantName", "celebrateTokenHash", "contributeTokenHash", "createdAt", "eventAt", "expiresAt", "hostEmail", "id", "mode", "occasion", "paidAt", "status", "timezone", "title", "unlockedAt") SELECT "adminTokenHash", "age", "bannerText", "celebrantName", "celebrateTokenHash", "contributeTokenHash", "createdAt", "eventAt", "expiresAt", "hostEmail", "id", "mode", "occasion", "paidAt", "status", "timezone", "title", "unlockedAt" FROM "Room";
DROP TABLE "Room";
ALTER TABLE "new_Room" RENAME TO "Room";
CREATE UNIQUE INDEX "Room_adminTokenHash_key" ON "Room"("adminTokenHash");
CREATE UNIQUE INDEX "Room_contributeTokenHash_key" ON "Room"("contributeTokenHash");
CREATE UNIQUE INDEX "Room_celebrateTokenHash_key" ON "Room"("celebrateTokenHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RoomObject_roomId_idx" ON "RoomObject"("roomId");

-- CreateIndex
CREATE INDEX "CustomItem_roomId_idx" ON "CustomItem"("roomId");
