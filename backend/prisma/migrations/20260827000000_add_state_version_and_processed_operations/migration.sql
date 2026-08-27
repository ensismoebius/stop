-- AlterTable: baseline de versão de estado da sala (spec: versões de estado).
ALTER TABLE `Room` ADD COLUMN `roomEpoch` INTEGER NOT NULL DEFAULT 1,
ADD COLUMN `stateVersion` INTEGER NOT NULL DEFAULT 0;

-- CreateTable: idempotência de comandos do cliente (spec: comandos confiáveis).
CREATE TABLE `ProcessedOperation` (
    `id` VARCHAR(64) NOT NULL,
    `roomId` INTEGER NOT NULL,
    `playerSessionId` INTEGER NULL,
    `command` VARCHAR(40) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `responseJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProcessedOperation_roomId_idx`(`roomId`),
    INDEX `ProcessedOperation_playerSessionId_idx`(`playerSessionId`),
    PRIMARY KEY (`roomId`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProcessedOperation` ADD CONSTRAINT `ProcessedOperation_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;