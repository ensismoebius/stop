-- AlterTable
ALTER TABLE `Round` ADD COLUMN `revealAt` DATETIME(3) NULL,
    MODIFY `status` ENUM('CREATED', 'READY', 'STARTING', 'PLAYING', 'STOPPED', 'COLLABORATIVE_CORRECTION', 'CORRECTION', 'SCORED', 'FINISHED') NOT NULL DEFAULT 'CREATED';

-- CreateTable
CREATE TABLE `AnswerReview` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roundId` INTEGER NOT NULL,
    `answerId` INTEGER NOT NULL,
    `graderPlayerSessionId` INTEGER NOT NULL,
    `decision` ENUM('VALID', 'INVALID') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AnswerReview_roundId_idx`(`roundId`),
    INDEX `AnswerReview_graderPlayerSessionId_idx`(`graderPlayerSessionId`),
    UNIQUE INDEX `AnswerReview_answerId_graderPlayerSessionId_key`(`answerId`, `graderPlayerSessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AnswerReview` ADD CONSTRAINT `AnswerReview_roundId_fkey` FOREIGN KEY (`roundId`) REFERENCES `Round`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnswerReview` ADD CONSTRAINT `AnswerReview_answerId_fkey` FOREIGN KEY (`answerId`) REFERENCES `Answer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnswerReview` ADD CONSTRAINT `AnswerReview_graderPlayerSessionId_fkey` FOREIGN KEY (`graderPlayerSessionId`) REFERENCES `PlayerSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
