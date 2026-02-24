-- CreateEnum
CREATE TYPE "AppRole" AS ENUM ('admin', 'campaign_manager', 'viewer');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "AppRole" NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Election" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Election_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionParty" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectionParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionRegion" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectionRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionSection" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "regionName" TEXT NOT NULL,
    "municipalityId" TEXT,
    "cityName" TEXT NOT NULL,
    "sectionName" TEXT NOT NULL,
    "sectionType" TEXT,
    "total" INTEGER,
    "voted" INTEGER,
    "discardedVotes" INTEGER,
    "noVotes" INTEGER,
    "noVotesPaper" INTEGER,
    "noVotesMachine" INTEGER,
    "totalPaper" INTEGER,
    "totalMachine" INTEGER,
    "activityBp" INTEGER,
    "riskScore" INTEGER,
    "hasProtocolError" BOOLEAN,
    "protocolErrorDiff" INTEGER,
    "protocolPaperVotes" INTEGER,
    "protocolMachineVotes" INTEGER,
    "votesToFirst" INTEGER,
    "topParties" JSONB,
    "partyVotes" JSONB,
    "candidateVotes" JSONB,
    "riskIndicators" JSONB,
    "candidateRiskIndicators" JSONB,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectionSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "externalId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "electionSectionId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionResult" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "electionSectionId" TEXT NOT NULL,
    "electionDate" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Election_date_key" ON "Election"("date");

-- CreateIndex
CREATE INDEX "ElectionParty_electionId_idx" ON "ElectionParty"("electionId");

-- CreateIndex
CREATE UNIQUE INDEX "ElectionParty_electionId_partyId_key" ON "ElectionParty"("electionId", "partyId");

-- CreateIndex
CREATE INDEX "ElectionRegion_electionId_idx" ON "ElectionRegion"("electionId");

-- CreateIndex
CREATE UNIQUE INDEX "ElectionRegion_electionId_regionId_key" ON "ElectionRegion"("electionId", "regionId");

-- CreateIndex
CREATE INDEX "ElectionSection_electionId_idx" ON "ElectionSection"("electionId");

-- CreateIndex
CREATE UNIQUE INDEX "ElectionSection_electionId_sectionId_key" ON "ElectionSection"("electionId", "sectionId");

-- CreateIndex
CREATE INDEX "Person_electionId_idx" ON "Person"("electionId");

-- CreateIndex
CREATE INDEX "Assignment_electionId_idx" ON "Assignment"("electionId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_electionId_personId_key" ON "Assignment"("electionId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_electionId_electionSectionId_roleId_key" ON "Assignment"("electionId", "electionSectionId", "roleId");

-- CreateIndex
CREATE INDEX "ElectionResult_electionId_idx" ON "ElectionResult"("electionId");

-- CreateIndex
CREATE INDEX "ElectionResult_electionDate_idx" ON "ElectionResult"("electionDate");

-- CreateIndex
CREATE UNIQUE INDEX "ElectionResult_electionId_electionSectionId_electionDate_key" ON "ElectionResult"("electionId", "electionSectionId", "electionDate");

-- AddForeignKey
ALTER TABLE "ElectionParty" ADD CONSTRAINT "ElectionParty_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionRegion" ADD CONSTRAINT "ElectionRegion_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionSection" ADD CONSTRAINT "ElectionSection_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_electionSectionId_fkey" FOREIGN KEY ("electionSectionId") REFERENCES "ElectionSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionResult" ADD CONSTRAINT "ElectionResult_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionResult" ADD CONSTRAINT "ElectionResult_electionSectionId_fkey" FOREIGN KEY ("electionSectionId") REFERENCES "ElectionSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
