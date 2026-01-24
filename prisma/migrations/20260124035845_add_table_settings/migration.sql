-- CreateTable
CREATE TABLE "OrgTableConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "allowedCols" TEXT[],
    "lockedCols" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgTableConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgTablePreset" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "visibleCols" TEXT[],
    "order" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgTablePreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTableView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visibleCols" TEXT[],
    "order" TEXT[],
    "basePresetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTableView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgTableConfig_orgId_idx" ON "OrgTableConfig"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgTableConfig_orgId_entity_key" ON "OrgTableConfig"("orgId", "entity");

-- CreateIndex
CREATE INDEX "OrgTablePreset_orgId_idx" ON "OrgTablePreset"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgTablePreset_orgId_entity_name_key" ON "OrgTablePreset"("orgId", "entity", "name");

-- CreateIndex
CREATE INDEX "UserTableView_userId_idx" ON "UserTableView"("userId");

-- CreateIndex
CREATE INDEX "UserTableView_orgId_idx" ON "UserTableView"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTableView_userId_orgId_entity_name_key" ON "UserTableView"("userId", "orgId", "entity", "name");

-- AddForeignKey
ALTER TABLE "OrgTableConfig" ADD CONSTRAINT "OrgTableConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgTablePreset" ADD CONSTRAINT "OrgTablePreset_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTableView" ADD CONSTRAINT "UserTableView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AuthorizedPersonnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTableView" ADD CONSTRAINT "UserTableView_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
