-- CreateTable
CREATE TABLE "Gift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boxId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "designJson" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "Gift_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Box" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "designJson" TEXT NOT NULL,
    "posX" REAL NOT NULL,
    "posY" REAL NOT NULL,
    "z" INTEGER NOT NULL DEFAULT 0,
    "scale" REAL NOT NULL DEFAULT 1,
    "createdBySessionHash" TEXT,
    "openInOrder" BOOLEAN NOT NULL DEFAULT false,
    "sealedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleteTokenHash" TEXT NOT NULL,
    "openedAt" DATETIME,
    "reportedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Box_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Box" ("createdAt", "deleteTokenHash", "designJson", "fromName", "id", "openedAt", "posX", "posY", "reportedAt", "roomId", "sealedAt", "z") SELECT "createdAt", "deleteTokenHash", "designJson", "fromName", "id", "openedAt", "posX", "posY", "reportedAt", "roomId", "sealedAt", "z" FROM "Box";
DROP TABLE "Box";
ALTER TABLE "new_Box" RENAME TO "Box";
CREATE INDEX "Box_roomId_idx" ON "Box"("roomId");
CREATE TABLE "new_Goodie" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boxId" TEXT NOT NULL,
    "giftId" TEXT,
    "type" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    CONSTRAINT "Goodie_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Goodie_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "Gift" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Goodie" ("boxId", "id", "payloadJson", "sizeBytes", "sortOrder", "type") SELECT "boxId", "id", "payloadJson", "sizeBytes", "sortOrder", "type" FROM "Goodie";
DROP TABLE "Goodie";
ALTER TABLE "new_Goodie" RENAME TO "Goodie";
CREATE INDEX "Goodie_boxId_idx" ON "Goodie"("boxId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Gift_boxId_idx" ON "Gift"("boxId");

-- Backfill (hand-written; Prisma only generates structure): every box that existed before gifts
-- gets exactly ONE default gift holding ALL of its goodies, so it opens exactly as it always did
-- (a single-gift box skips the inner-gift step). The gift id is derived from the box id so the
-- migration is deterministic and safe to reason about. Boxes get scale 1 / no owner / not
-- open-in-order from the column defaults above.
INSERT INTO "Gift" ("id", "boxId", "sortOrder", "label", "designJson")
SELECT 'gift_' || "id", "id", 0, '', '{}' FROM "Box";

UPDATE "Goodie" SET "giftId" = 'gift_' || "boxId" WHERE "giftId" IS NULL;
