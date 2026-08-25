-- AlterTable
ALTER TABLE `Class` ADD COLUMN `discipline` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `GameResult` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gameId` INTEGER NOT NULL,
    `studentId` INTEGER NOT NULL,
    `score` INTEGER NOT NULL,
    `position` INTEGER NOT NULL,
    `medal` ENUM('GOLD', 'SILVER', 'BRONZE') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GameResult_studentId_idx`(`studentId`),
    INDEX `GameResult_gameId_idx`(`gameId`),
    UNIQUE INDEX `GameResult_gameId_studentId_key`(`gameId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GameResult` ADD CONSTRAINT `GameResult_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `Game`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GameResult` ADD CONSTRAINT `GameResult_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
