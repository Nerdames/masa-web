/*
  Warnings:

  - You are about to drop the `OrgTableConfig` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrgTablePreset` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserTableView` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "OrgTableConfig" DROP CONSTRAINT "OrgTableConfig_orgId_fkey";

-- DropForeignKey
ALTER TABLE "OrgTablePreset" DROP CONSTRAINT "OrgTablePreset_orgId_fkey";

-- DropForeignKey
ALTER TABLE "UserTableView" DROP CONSTRAINT "UserTableView_orgId_fkey";

-- DropForeignKey
ALTER TABLE "UserTableView" DROP CONSTRAINT "UserTableView_userId_fkey";

-- DropTable
DROP TABLE "OrgTableConfig";

-- DropTable
DROP TABLE "OrgTablePreset";

-- DropTable
DROP TABLE "UserTableView";
