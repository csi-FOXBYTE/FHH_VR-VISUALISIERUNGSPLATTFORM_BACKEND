-- CreateEnum
CREATE TYPE "LANGUAGES" AS ENUM ('EN', 'DE');

-- CreateEnum
CREATE TYPE "PERMISSIONS" AS ENUM ('BASE_LAYER_OWNER', 'EVENT_OWNER', 'PROJECT_OWNER', 'CONFIGURATION_ADMINISTRATOR', 'DATA_MANAGEMENT_ADMINISTRATOR', 'USER_ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "LAYER_TYPE" AS ENUM ('TILES3D', 'TERRAIN', 'IMAGERY', 'WMS');

-- CreateEnum
CREATE TYPE "BASE_LAYER_CONVERSION_STATUS" AS ENUM ('ACTIVE', 'PENDING', 'FAILED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EVENT_STATUS" AS ENUM ('MISSING_HOST', 'ACTIVE', 'PLANNED', 'CANCELED', 'END');

-- CreateEnum
CREATE TYPE "EVENT_ATTENDEE_ROLES" AS ENUM ('GUEST', 'MODERATOR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "language" "LANGUAGES",

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "Authenticator" (
    "credentialID" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "credentialPublicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "credentialDeviceType" TEXT NOT NULL,
    "credentialBackedUp" BOOLEAN NOT NULL,
    "transports" TEXT,

    CONSTRAINT "Authenticator_pkey" PRIMARY KEY ("userId","credentialID")
);

-- CreateTable
CREATE TABLE "Project" (
    "ownerId" TEXT,
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "img" TEXT,
    "camera" JSONB,
    "region" JSONB,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClippingPolygon" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "points" DOUBLE PRECISION[],
    "projectLayerId" TEXT NOT NULL,
    "affectsTerrain" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ClippingPolygon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectModel" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "attributes" TEXT NOT NULL,
    "projectLayerId" TEXT NOT NULL,
    "rotationX" DOUBLE PRECISION NOT NULL,
    "rotationY" DOUBLE PRECISION NOT NULL,
    "rotationZ" DOUBLE PRECISION NOT NULL,
    "rotationW" DOUBLE PRECISION NOT NULL,
    "scaleX" DOUBLE PRECISION NOT NULL,
    "scaleY" DOUBLE PRECISION NOT NULL,
    "scaleZ" DOUBLE PRECISION NOT NULL,
    "translationX" DOUBLE PRECISION NOT NULL,
    "translationY" DOUBLE PRECISION NOT NULL,
    "translationZ" DOUBLE PRECISION NOT NULL,
    "uiRotationEulerX" TEXT NOT NULL,
    "uiRotationEulerY" TEXT NOT NULL,
    "uiRotationEulerZ" TEXT NOT NULL,
    "uiScaleX" TEXT NOT NULL,
    "uiScaleY" TEXT NOT NULL,
    "uiScaleZ" TEXT NOT NULL,
    "uiTranslationX" TEXT NOT NULL,
    "uiTranslationY" TEXT NOT NULL,
    "uiTranslationZ" TEXT NOT NULL,
    "uiEpsg" TEXT NOT NULL,

    CONSTRAINT "ProjectModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualAxis" (
    "ownerId" TEXT,
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "startPointX" DOUBLE PRECISION NOT NULL,
    "startPointY" DOUBLE PRECISION NOT NULL,
    "startPointZ" DOUBLE PRECISION NOT NULL,
    "uiStartPointX" TEXT NOT NULL,
    "uiStartPointY" TEXT NOT NULL,
    "uiStartPointZ" TEXT NOT NULL,
    "uiStartPointEpsg" TEXT NOT NULL,
    "endPointX" DOUBLE PRECISION NOT NULL,
    "endPointY" DOUBLE PRECISION NOT NULL,
    "endPointZ" DOUBLE PRECISION NOT NULL,
    "uiEndPointX" TEXT NOT NULL,
    "uiEndPointY" TEXT NOT NULL,
    "uiEndPointZ" TEXT NOT NULL,
    "uiEndPointEpsg" TEXT NOT NULL,

    CONSTRAINT "VisualAxis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StartingPoint" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "startPointX" DOUBLE PRECISION NOT NULL,
    "startPointY" DOUBLE PRECISION NOT NULL,
    "startPointZ" DOUBLE PRECISION NOT NULL,
    "uiStartPointX" TEXT NOT NULL,
    "uiStartPointY" TEXT NOT NULL,
    "uiStartPointZ" TEXT NOT NULL,
    "uiStartPointEpsg" TEXT NOT NULL,
    "endPointX" DOUBLE PRECISION NOT NULL,
    "endPointY" DOUBLE PRECISION NOT NULL,
    "endPointZ" DOUBLE PRECISION NOT NULL,
    "uiEndPointX" TEXT NOT NULL,
    "uiEndPointY" TEXT NOT NULL,
    "uiEndPointZ" TEXT NOT NULL,
    "uiEndPointEpsg" TEXT NOT NULL,
    "projectId" TEXT,
    "img" TEXT NOT NULL,

    CONSTRAINT "StartingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectLayer" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "ProjectLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtensionLayer" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LAYER_TYPE" NOT NULL,
    "projectId" TEXT NOT NULL,
    "href" TEXT NOT NULL,

    CONSTRAINT "ExtensionLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "isAdminGroup" BOOLEAN NOT NULL DEFAULT false,
    "defaultFor" TEXT[],

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedPermissions" "PERMISSIONS"[],
    "name" TEXT NOT NULL,
    "isAdminRole" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseLayer" (
    "ownerId" TEXT,
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LAYER_TYPE" NOT NULL,
    "status" "BASE_LAYER_CONVERSION_STATUS" NOT NULL DEFAULT 'COMPLETED',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sizeGB" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "href" TEXT,
    "containerName" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BaseLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "ownerId" TEXT,
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "EVENT_STATUS" NOT NULL,
    "title" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "joinCode" TEXT,
    "heartbeatTimestamp" TIMESTAMP(3),
    "projectId" TEXT,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAttendee" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "EVENT_ATTENDEE_ROLES" NOT NULL,

    CONSTRAINT "EventAttendee_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateTable
CREATE TABLE "Configuration" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "defaultEPSG" TEXT NOT NULL,
    "globalStartPointX" DOUBLE PRECISION NOT NULL,
    "globalStartPointY" DOUBLE PRECISION NOT NULL,
    "globalStartPointZ" DOUBLE PRECISION NOT NULL,
    "uiGlobalStartPointX" TEXT NOT NULL,
    "uiGlobalStartPointY" TEXT NOT NULL,
    "uiGlobalStartPointZ" TEXT NOT NULL,
    "uiGlobalStartPointEpsg" TEXT NOT NULL,
    "maxParallelFileConversions" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "maxParallelBaseLayerConversions" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "used3DTileConversionThreads" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "usedTerrainConversionThreads" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "invitationEmailText" TEXT NOT NULL,
    "localProcessorFolder" TEXT NOT NULL DEFAULT './processor',
    "emailUser" TEXT NOT NULL,
    "emailPassword" TEXT NOT NULL,
    "emailHost" TEXT NOT NULL,
    "emailPort" INTEGER NOT NULL,
    "emailSecure" BOOLEAN NOT NULL,
    "emailPlatformAddress" TEXT NOT NULL,
    "maximumFlyingHeight" DOUBLE PRECISION NOT NULL,
    "invitationEmailDE" TEXT NOT NULL,
    "invitationEmailEN" TEXT NOT NULL,
    "invitationCancelledEmailDE" TEXT NOT NULL,
    "invitationCancelledEmailEN" TEXT NOT NULL,
    "invitationUpdatedEmailDE" TEXT NOT NULL,
    "invitationUpdatedEmailEN" TEXT NOT NULL,
    "predeletionEmailDE" TEXT NOT NULL,
    "predeletionEmailEN" TEXT NOT NULL,
    "systemActivityLink" TEXT NOT NULL,
    "userProfileLink" TEXT NOT NULL,
    "unityDownloadLink" TEXT NOT NULL,

    CONSTRAINT "Configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_visibleForUsers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_visibleForUsers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_includedInProjects" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_includedInProjects_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ExtensionLayerToProjectLayer" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ExtensionLayerToProjectLayer_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_GroupToUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GroupToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_GroupToRole" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GroupToRole_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_GroupToProject" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GroupToProject_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_BaseLayerToGroup" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BaseLayerToGroup_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_BaseLayerToProjectLayer" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BaseLayerToProjectLayer_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Authenticator_credentialID_key" ON "Authenticator"("credentialID");

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "_visibleForUsers_B_index" ON "_visibleForUsers"("B");

-- CreateIndex
CREATE INDEX "_includedInProjects_B_index" ON "_includedInProjects"("B");

-- CreateIndex
CREATE INDEX "_ExtensionLayerToProjectLayer_B_index" ON "_ExtensionLayerToProjectLayer"("B");

-- CreateIndex
CREATE INDEX "_GroupToUser_B_index" ON "_GroupToUser"("B");

-- CreateIndex
CREATE INDEX "_GroupToRole_B_index" ON "_GroupToRole"("B");

-- CreateIndex
CREATE INDEX "_GroupToProject_B_index" ON "_GroupToProject"("B");

-- CreateIndex
CREATE INDEX "_BaseLayerToGroup_B_index" ON "_BaseLayerToGroup"("B");

-- CreateIndex
CREATE INDEX "_BaseLayerToProjectLayer_B_index" ON "_BaseLayerToProjectLayer"("B");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authenticator" ADD CONSTRAINT "Authenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClippingPolygon" ADD CONSTRAINT "ClippingPolygon_projectLayerId_fkey" FOREIGN KEY ("projectLayerId") REFERENCES "ProjectLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectModel" ADD CONSTRAINT "ProjectModel_projectLayerId_fkey" FOREIGN KEY ("projectLayerId") REFERENCES "ProjectLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualAxis" ADD CONSTRAINT "VisualAxis_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StartingPoint" ADD CONSTRAINT "StartingPoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLayer" ADD CONSTRAINT "ProjectLayer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionLayer" ADD CONSTRAINT "ExtensionLayer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseLayer" ADD CONSTRAINT "BaseLayer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_visibleForUsers" ADD CONSTRAINT "_visibleForUsers_A_fkey" FOREIGN KEY ("A") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_visibleForUsers" ADD CONSTRAINT "_visibleForUsers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_includedInProjects" ADD CONSTRAINT "_includedInProjects_A_fkey" FOREIGN KEY ("A") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_includedInProjects" ADD CONSTRAINT "_includedInProjects_B_fkey" FOREIGN KEY ("B") REFERENCES "ProjectLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExtensionLayerToProjectLayer" ADD CONSTRAINT "_ExtensionLayerToProjectLayer_A_fkey" FOREIGN KEY ("A") REFERENCES "ExtensionLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExtensionLayerToProjectLayer" ADD CONSTRAINT "_ExtensionLayerToProjectLayer_B_fkey" FOREIGN KEY ("B") REFERENCES "ProjectLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupToUser" ADD CONSTRAINT "_GroupToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupToUser" ADD CONSTRAINT "_GroupToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupToRole" ADD CONSTRAINT "_GroupToRole_A_fkey" FOREIGN KEY ("A") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupToRole" ADD CONSTRAINT "_GroupToRole_B_fkey" FOREIGN KEY ("B") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupToProject" ADD CONSTRAINT "_GroupToProject_A_fkey" FOREIGN KEY ("A") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupToProject" ADD CONSTRAINT "_GroupToProject_B_fkey" FOREIGN KEY ("B") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BaseLayerToGroup" ADD CONSTRAINT "_BaseLayerToGroup_A_fkey" FOREIGN KEY ("A") REFERENCES "BaseLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BaseLayerToGroup" ADD CONSTRAINT "_BaseLayerToGroup_B_fkey" FOREIGN KEY ("B") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BaseLayerToProjectLayer" ADD CONSTRAINT "_BaseLayerToProjectLayer_A_fkey" FOREIGN KEY ("A") REFERENCES "BaseLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BaseLayerToProjectLayer" ADD CONSTRAINT "_BaseLayerToProjectLayer_B_fkey" FOREIGN KEY ("B") REFERENCES "ProjectLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


