-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('STAFF_MANAGE', 'SETTINGS_READ', 'SETTINGS_WRITE', 'CATALOGUE_READ', 'CATALOGUE_WRITE', 'MENU_READ', 'MENU_WRITE', 'PRICING_READ', 'PRICING_WRITE', 'COMPANIES_READ', 'COMPANIES_WRITE', 'EMPLOYEES_READ', 'EMPLOYEES_WRITE', 'ORDERS_READ', 'ORDERS_WRITE', 'ORDERS_OVERRIDE', 'CUTOFF_RUN', 'KITCHEN_READ', 'KITCHEN_WORK', 'KITCHEN_FORCE_COMPLETE', 'DISPATCH_READ', 'DISPATCH_MANAGE', 'DELIVERIES_OWN', 'DELIVERIES_ANY', 'BILLING_READ', 'BILLING_WRITE');

-- CreateEnum
CREATE TYPE "Dashboard" AS ENUM ('ADMIN', 'KITCHEN', 'DISPATCH', 'DRIVER');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" "Permission"[],
    "homeDashboard" "Dashboard" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Supabase hardening (added by hand): turn on Row Level Security with no policies.
-- Supabase's public API roles (anon, authenticated) then can't read or write these tables at all,
-- even if the Data API were switched back on. Our NestJS API connects as the table owner,
-- which RLS does not restrict, so the app itself is unaffected.
ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

