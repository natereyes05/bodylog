-- AlterTable
ALTER TABLE "MealLog" ADD COLUMN "userEdited" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FavoriteMeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "calories" INTEGER,
    "proteinG" INTEGER,
    "carbsG" INTEGER,
    "fatG" INTEGER,
    "fiberG" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteMeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FavoriteMeal_userId_idx" ON "FavoriteMeal"("userId");

-- AddForeignKey
ALTER TABLE "FavoriteMeal" ADD CONSTRAINT "FavoriteMeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
