-- DropForeignKey
ALTER TABLE `Game` DROP FOREIGN KEY `Game_classId_fkey`;

-- DropForeignKey
ALTER TABLE `PlayerSession` DROP FOREIGN KEY `PlayerSession_studentId_fkey`;

-- AddForeignKey
ALTER TABLE `Game` ADD CONSTRAINT `Game_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerSession` ADD CONSTRAINT `PlayerSession_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
