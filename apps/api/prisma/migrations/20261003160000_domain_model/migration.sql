-- CreateEnum
CREATE TYPE "Temperature" AS ENUM ('HOT', 'COLD');

-- CreateEnum
CREATE TYPE "PriceRuleBasis" AS ENUM ('NONE', 'COST', 'TIER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PLACED', 'CONFIRMED', 'DELIVERED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('CREATED', 'UPDATED', 'PLACED', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'DELIVERY_CHANGED', 'UNIT_STARTED', 'UNIT_DONE', 'KITCHEN_STARTED', 'KITCHEN_READY', 'FORCE_COMPLETED', 'DRIVER_ASSIGNED', 'DISPATCH_READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'INVOICED', 'CREDITED');

-- CreateEnum
CREATE TYPE "CutoffTrigger" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PAID');

-- CreateEnum
CREATE TYPE "AdjustmentReason" AS ENUM ('CANCELLED_AFTER_INVOICE', 'REJECTED_AFTER_INVOICE', 'SHORT_DELIVERY', 'OTHER');

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "kitchenWorkingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7]::INTEGER[],
    "cutoffTimeMinutes" INTEGER NOT NULL DEFAULT 960,
    "cutoffDaysBefore" INTEGER NOT NULL DEFAULT 2,
    "autoCutoffProcessing" BOOLEAN NOT NULL DEFAULT true,
    "atRiskMinutes" INTEGER NOT NULL DEFAULT 30,
    "onTimeGraceMinutes" INTEGER NOT NULL DEFAULT 10,
    "deliveryWindowStartMinutes" INTEGER NOT NULL DEFAULT 420,
    "deliveryWindowEndMinutes" INTEGER NOT NULL DEFAULT 1260,
    "deliverySlotMinutes" INTEGER NOT NULL DEFAULT 15,
    "publicEmailDomains" TEXT[] DEFAULT ARRAY['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'rediffmail.com', 'zoho.com', 'gmx.com', 'yandex.com', 'mail.com']::TEXT[],
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenHoliday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitchenHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allergen" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Allergen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DietaryTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DietaryTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenStation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "KitchenStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortionSize" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PortionSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PackagingType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dish" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "temperature" "Temperature" NOT NULL,
    "costCents" INTEGER NOT NULL,
    "kitchenStationId" TEXT,
    "minOrderQuantity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishAllergen" (
    "dishId" TEXT NOT NULL,
    "allergenId" TEXT NOT NULL,

    CONSTRAINT "DishAllergen_pkey" PRIMARY KEY ("dishId","allergenId")
);

-- CreateTable
CREATE TABLE "DishDietaryTag" (
    "dishId" TEXT NOT NULL,
    "dietaryTagId" TEXT NOT NULL,

    CONSTRAINT "DishDietaryTag_pkey" PRIMARY KEY ("dishId","dietaryTagId")
);

-- CreateTable
CREATE TABLE "Option" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "costCents" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionAllergen" (
    "optionId" TEXT NOT NULL,
    "allergenId" TEXT NOT NULL,

    CONSTRAINT "OptionAllergen_pkey" PRIMARY KEY ("optionId","allergenId")
);

-- CreateTable
CREATE TABLE "OptionDietaryTag" (
    "optionId" TEXT NOT NULL,
    "dietaryTagId" TEXT NOT NULL,

    CONSTRAINT "OptionDietaryTag_pkey" PRIMARY KEY ("optionId","dietaryTagId")
);

-- CreateTable
CREATE TABLE "OptionPortion" (
    "optionId" TEXT NOT NULL,
    "portionSizeId" TEXT NOT NULL,
    "extraChargeCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OptionPortion_pkey" PRIMARY KEY ("optionId","portionSizeId")
);

-- CreateTable
CREATE TABLE "OptionGroup" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "maxSelections" INTEGER NOT NULL DEFAULT 1,
    "usesPortions" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionGroupOption" (
    "groupId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OptionGroupOption_pkey" PRIMARY KEY ("groupId","optionId")
);

-- CreateTable
CREATE TABLE "OptionGroupPortionSize" (
    "groupId" TEXT NOT NULL,
    "portionSizeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OptionGroupPortionSize_pkey" PRIMARY KEY ("groupId","portionSizeId")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyHiddenCategory" (
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "CompanyHiddenCategory_pkey" PRIMARY KEY ("companyId","categoryId")
);

-- CreateTable
CREATE TABLE "CompanyHiddenMenuItem" (
    "companyId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,

    CONSTRAINT "CompanyHiddenMenuItem_pkey" PRIMARY KEY ("companyId","menuItemId")
);

-- CreateTable
CREATE TABLE "PriceTier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "ruleBasis" "PriceRuleBasis" NOT NULL DEFAULT 'NONE',
    "baseTierId" TEXT,
    "multiplierBps" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishPrice" (
    "tierId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DishPrice_pkey" PRIMARY KEY ("tierId","dishId")
);

-- CreateTable
CREATE TABLE "OptionPrice" (
    "tierId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OptionPrice_pkey" PRIMARY KEY ("tierId","optionId")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceTierId" TEXT,
    "ownerEmployeeId" TEXT,
    "billingContactName" TEXT NOT NULL,
    "billingEmail" TEXT NOT NULL,
    "billingPhone" TEXT,
    "billingAddress" TEXT NOT NULL,
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "defaultDeliveryTimeMinutes" INTEGER NOT NULL DEFAULT 750,
    "deliveryLeadMinutes" INTEGER NOT NULL DEFAULT 60,
    "defaultPackagingTypeId" TEXT,
    "driverInstructions" TEXT NOT NULL DEFAULT '',
    "defaultDriverId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDomain" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAddress" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CompanyAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyHoliday" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "canChooseAddress" BOOLEAN NOT NULL DEFAULT false,
    "canChangeDeliveryTime" BOOLEAN NOT NULL DEFAULT false,
    "canChangePackaging" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAllergy" (
    "employeeId" TEXT NOT NULL,
    "allergenId" TEXT NOT NULL,

    CONSTRAINT "EmployeeAllergy_pkey" PRIMARY KEY ("employeeId","allergenId")
);

-- CreateTable
CREATE TABLE "EmployeeDietaryPreference" (
    "employeeId" TEXT NOT NULL,
    "dietaryTagId" TEXT NOT NULL,

    CONSTRAINT "EmployeeDietaryPreference_pkey" PRIMARY KEY ("employeeId","dietaryTagId")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "priceTierId" TEXT NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "deliveryTimeMinutes" INTEGER NOT NULL,
    "deliveryAt" TIMESTAMPTZ(3) NOT NULL,
    "addressId" TEXT NOT NULL,
    "addressText" TEXT NOT NULL,
    "packagingTypeId" TEXT NOT NULL,
    "packagingName" TEXT NOT NULL,
    "deliveryLeadMinutes" INTEGER NOT NULL,
    "plannedDispatchReadyAt" TIMESTAMPTZ(3) NOT NULL,
    "plannedKitchenReadyAt" TIMESTAMPTZ(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "placedAt" TIMESTAMPTZ(3),
    "confirmedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "rejectedAt" TIMESTAMPTZ(3),
    "statusReason" TEXT,
    "kitchenStartedAt" TIMESTAMPTZ(3),
    "kitchenReadyAt" TIMESTAMPTZ(3),
    "dropId" TEXT,
    "invoiceId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL,
    "dishName" TEXT NOT NULL,
    "dishSku" TEXT NOT NULL,
    "dishUnitPriceCents" INTEGER NOT NULL,
    "dishUnitCostCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLineCombination" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "signature" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "kitchenStartedAt" TIMESTAMPTZ(3),
    "kitchenStartedById" TEXT,
    "kitchenDoneAt" TIMESTAMPTZ(3),
    "kitchenDoneById" TEXT,

    CONSTRAINT "OrderLineCombination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CombinationOption" (
    "id" TEXT NOT NULL,
    "combinationId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "optionGroupId" TEXT,
    "portionSizeId" TEXT,
    "optionName" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "portionName" TEXT,
    "priceCents" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL,

    CONSTRAINT "CombinationOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "actorId" TEXT,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CutoffRun" (
    "id" TEXT NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "trigger" "CutoffTrigger" NOT NULL,
    "actorId" TEXT,
    "cancelledCount" INTEGER NOT NULL,
    "confirmedCount" INTEGER NOT NULL,
    "ranAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CutoffRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drop" (
    "id" TEXT NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "companyId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "deliveryTimeMinutes" INTEGER NOT NULL,
    "deliveryAt" TIMESTAMPTZ(3) NOT NULL,
    "driverId" TEXT,
    "dispatchReadyAt" TIMESTAMPTZ(3),
    "outForDeliveryAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "deliveryNote" TEXT,
    "deliveredOnTime" BOOLEAN,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Drop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPhoto" (
    "id" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "periodStart" DATE,
    "periodEnd" DATE,
    "ordersTotalCents" INTEGER NOT NULL,
    "adjustmentsTotalCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "paidAt" TIMESTAMPTZ(3),
    "paidById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAdjustment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" "AdjustmentReason" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "invoiceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KitchenHoliday_date_key" ON "KitchenHoliday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Allergen_name_key" ON "Allergen"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DietaryTag_name_key" ON "DietaryTag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenStation_name_key" ON "KitchenStation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PortionSize_name_key" ON "PortionSize"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingType_name_key" ON "PackagingType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Dish_sku_key" ON "Dish"("sku");

-- CreateIndex
CREATE INDEX "Dish_kitchenStationId_idx" ON "Dish"("kitchenStationId");

-- CreateIndex
CREATE INDEX "DishAllergen_allergenId_idx" ON "DishAllergen"("allergenId");

-- CreateIndex
CREATE INDEX "DishDietaryTag_dietaryTagId_idx" ON "DishDietaryTag"("dietaryTagId");

-- CreateIndex
CREATE UNIQUE INDEX "Option_name_key" ON "Option"("name");

-- CreateIndex
CREATE INDEX "OptionAllergen_allergenId_idx" ON "OptionAllergen"("allergenId");

-- CreateIndex
CREATE INDEX "OptionDietaryTag_dietaryTagId_idx" ON "OptionDietaryTag"("dietaryTagId");

-- CreateIndex
CREATE INDEX "OptionPortion_portionSizeId_idx" ON "OptionPortion"("portionSizeId");

-- CreateIndex
CREATE INDEX "OptionGroup_dishId_idx" ON "OptionGroup"("dishId");

-- CreateIndex
CREATE INDEX "OptionGroupOption_optionId_idx" ON "OptionGroupOption"("optionId");

-- CreateIndex
CREATE INDEX "OptionGroupPortionSize_portionSizeId_idx" ON "OptionGroupPortionSize"("portionSizeId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_name_key" ON "MenuCategory"("name");

-- CreateIndex
CREATE INDEX "MenuItem_dishId_idx" ON "MenuItem"("dishId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_categoryId_dishId_key" ON "MenuItem"("categoryId", "dishId");

-- CreateIndex
CREATE INDEX "CompanyHiddenCategory_categoryId_idx" ON "CompanyHiddenCategory"("categoryId");

-- CreateIndex
CREATE INDEX "CompanyHiddenMenuItem_menuItemId_idx" ON "CompanyHiddenMenuItem"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceTier_name_key" ON "PriceTier"("name");

-- CreateIndex
CREATE INDEX "DishPrice_dishId_idx" ON "DishPrice"("dishId");

-- CreateIndex
CREATE INDEX "OptionPrice_optionId_idx" ON "OptionPrice"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Company_ownerEmployeeId_key" ON "Company"("ownerEmployeeId");

-- CreateIndex
CREATE INDEX "Company_priceTierId_idx" ON "Company"("priceTierId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyDomain_domain_key" ON "CompanyDomain"("domain");

-- CreateIndex
CREATE INDEX "CompanyDomain_companyId_idx" ON "CompanyDomain"("companyId");

-- CreateIndex
CREATE INDEX "CompanyAddress_companyId_idx" ON "CompanyAddress"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyHoliday_companyId_date_key" ON "CompanyHoliday"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_companyId_idx" ON "Employee"("companyId");

-- CreateIndex
CREATE INDEX "EmployeeAllergy_allergenId_idx" ON "EmployeeAllergy"("allergenId");

-- CreateIndex
CREATE INDEX "EmployeeDietaryPreference_dietaryTagId_idx" ON "EmployeeDietaryPreference"("dietaryTagId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE INDEX "Order_deliveryDate_status_idx" ON "Order"("deliveryDate", "status");

-- CreateIndex
CREATE INDEX "Order_companyId_deliveryDate_idx" ON "Order"("companyId", "deliveryDate");

-- CreateIndex
CREATE INDEX "Order_employeeId_deliveryDate_idx" ON "Order"("employeeId", "deliveryDate");

-- CreateIndex
CREATE INDEX "Order_invoiceId_idx" ON "Order"("invoiceId");

-- CreateIndex
CREATE INDEX "Order_dropId_idx" ON "Order"("dropId");

-- CreateIndex
CREATE INDEX "OrderLine_dishId_idx" ON "OrderLine"("dishId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_orderId_dishId_key" ON "OrderLine"("orderId", "dishId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLineCombination_lineId_signature_key" ON "OrderLineCombination"("lineId", "signature");

-- CreateIndex
CREATE INDEX "CombinationOption_combinationId_idx" ON "CombinationOption"("combinationId");

-- CreateIndex
CREATE INDEX "CombinationOption_optionId_idx" ON "CombinationOption"("optionId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "CutoffRun_deliveryDate_idx" ON "CutoffRun"("deliveryDate");

-- CreateIndex
CREATE INDEX "Drop_deliveryDate_idx" ON "Drop"("deliveryDate");

-- CreateIndex
CREATE INDEX "Drop_driverId_deliveryDate_idx" ON "Drop"("driverId", "deliveryDate");

-- CreateIndex
CREATE UNIQUE INDEX "Drop_deliveryDate_companyId_addressId_deliveryTimeMinutes_key" ON "Drop"("deliveryDate", "companyId", "addressId", "deliveryTimeMinutes");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPhoto_dropId_key" ON "DeliveryPhoto"("dropId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");

-- CreateIndex
CREATE INDEX "BillingAdjustment_companyId_invoiceId_idx" ON "BillingAdjustment"("companyId", "invoiceId");

-- CreateIndex
CREATE INDEX "BillingAdjustment_orderId_idx" ON "BillingAdjustment"("orderId");

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_kitchenStationId_fkey" FOREIGN KEY ("kitchenStationId") REFERENCES "KitchenStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishAllergen" ADD CONSTRAINT "DishAllergen_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishAllergen" ADD CONSTRAINT "DishAllergen_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "Allergen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishDietaryTag" ADD CONSTRAINT "DishDietaryTag_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishDietaryTag" ADD CONSTRAINT "DishDietaryTag_dietaryTagId_fkey" FOREIGN KEY ("dietaryTagId") REFERENCES "DietaryTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionAllergen" ADD CONSTRAINT "OptionAllergen_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionAllergen" ADD CONSTRAINT "OptionAllergen_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "Allergen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionDietaryTag" ADD CONSTRAINT "OptionDietaryTag_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionDietaryTag" ADD CONSTRAINT "OptionDietaryTag_dietaryTagId_fkey" FOREIGN KEY ("dietaryTagId") REFERENCES "DietaryTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionPortion" ADD CONSTRAINT "OptionPortion_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionPortion" ADD CONSTRAINT "OptionPortion_portionSizeId_fkey" FOREIGN KEY ("portionSizeId") REFERENCES "PortionSize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroupOption" ADD CONSTRAINT "OptionGroupOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroupOption" ADD CONSTRAINT "OptionGroupOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroupPortionSize" ADD CONSTRAINT "OptionGroupPortionSize_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroupPortionSize" ADD CONSTRAINT "OptionGroupPortionSize_portionSizeId_fkey" FOREIGN KEY ("portionSizeId") REFERENCES "PortionSize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenCategory" ADD CONSTRAINT "CompanyHiddenCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenCategory" ADD CONSTRAINT "CompanyHiddenCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenMenuItem" ADD CONSTRAINT "CompanyHiddenMenuItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenMenuItem" ADD CONSTRAINT "CompanyHiddenMenuItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_baseTierId_fkey" FOREIGN KEY ("baseTierId") REFERENCES "PriceTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishPrice" ADD CONSTRAINT "DishPrice_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "PriceTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishPrice" ADD CONSTRAINT "DishPrice_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionPrice" ADD CONSTRAINT "OptionPrice_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "PriceTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionPrice" ADD CONSTRAINT "OptionPrice_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_priceTierId_fkey" FOREIGN KEY ("priceTierId") REFERENCES "PriceTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_defaultPackagingTypeId_fkey" FOREIGN KEY ("defaultPackagingTypeId") REFERENCES "PackagingType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_defaultDriverId_fkey" FOREIGN KEY ("defaultDriverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDomain" ADD CONSTRAINT "CompanyDomain_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAddress" ADD CONSTRAINT "CompanyAddress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHoliday" ADD CONSTRAINT "CompanyHoliday_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAllergy" ADD CONSTRAINT "EmployeeAllergy_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAllergy" ADD CONSTRAINT "EmployeeAllergy_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "Allergen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDietaryPreference" ADD CONSTRAINT "EmployeeDietaryPreference_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDietaryPreference" ADD CONSTRAINT "EmployeeDietaryPreference_dietaryTagId_fkey" FOREIGN KEY ("dietaryTagId") REFERENCES "DietaryTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_priceTierId_fkey" FOREIGN KEY ("priceTierId") REFERENCES "PriceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "CompanyAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_packagingTypeId_fkey" FOREIGN KEY ("packagingTypeId") REFERENCES "PackagingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineCombination" ADD CONSTRAINT "OrderLineCombination_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineCombination" ADD CONSTRAINT "OrderLineCombination_kitchenStartedById_fkey" FOREIGN KEY ("kitchenStartedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineCombination" ADD CONSTRAINT "OrderLineCombination_kitchenDoneById_fkey" FOREIGN KEY ("kitchenDoneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombinationOption" ADD CONSTRAINT "CombinationOption_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "OrderLineCombination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombinationOption" ADD CONSTRAINT "CombinationOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombinationOption" ADD CONSTRAINT "CombinationOption_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "OptionGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombinationOption" ADD CONSTRAINT "CombinationOption_portionSizeId_fkey" FOREIGN KEY ("portionSizeId") REFERENCES "PortionSize"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CutoffRun" ADD CONSTRAINT "CutoffRun_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "CompanyAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPhoto" ADD CONSTRAINT "DeliveryPhoto_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAdjustment" ADD CONSTRAINT "BillingAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAdjustment" ADD CONSTRAINT "BillingAdjustment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAdjustment" ADD CONSTRAINT "BillingAdjustment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAdjustment" ADD CONSTRAINT "BillingAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- Added by hand: rules the database enforces itself.
-- Prisma's schema language can't express CHECK constraints or partial unique indexes,
-- so they live here. The API validates the same rules with friendly messages; these are
-- the last line of defence if a bug or a manual edit ever tries to break them.
-- ===========================================================================

-- Settings: exactly one row, with sensible values. Created here so settings always exist.
ALTER TABLE "PlatformSettings"
  ADD CONSTRAINT "PlatformSettings_single_row" CHECK ("id" = 1),
  ADD CONSTRAINT "PlatformSettings_kitchen_days_valid"
    CHECK (cardinality("kitchenWorkingDays") > 0 AND "kitchenWorkingDays" <@ ARRAY[1,2,3,4,5,6,7]),
  ADD CONSTRAINT "PlatformSettings_cutoff_valid"
    CHECK ("cutoffTimeMinutes" BETWEEN 0 AND 1439 AND "cutoffDaysBefore" BETWEEN 0 AND 30),
  ADD CONSTRAINT "PlatformSettings_minutes_valid"
    CHECK ("atRiskMinutes" >= 0 AND "onTimeGraceMinutes" >= 0 AND "deliverySlotMinutes" > 0
      AND "deliveryWindowStartMinutes" BETWEEN 0 AND 1439
      AND "deliveryWindowEndMinutes" BETWEEN 0 AND 1439
      AND "deliveryWindowStartMinutes" < "deliveryWindowEndMinutes");

INSERT INTO "PlatformSettings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP);

-- Emails and domains are stored lower-case, so uniqueness can't be dodged with capitals.
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "CompanyDomain" ADD CONSTRAINT "CompanyDomain_domain_lowercase" CHECK ("domain" = lower("domain"));

-- Catalogue: no negative costs; quantities and selections are positive.
ALTER TABLE "Dish"
  ADD CONSTRAINT "Dish_cost_nonnegative" CHECK ("costCents" >= 0),
  ADD CONSTRAINT "Dish_min_order_positive" CHECK ("minOrderQuantity" IS NULL OR "minOrderQuantity" > 0);
ALTER TABLE "Option" ADD CONSTRAINT "Option_cost_nonnegative" CHECK ("costCents" >= 0);
ALTER TABLE "OptionPortion" ADD CONSTRAINT "OptionPortion_extra_nonnegative" CHECK ("extraChargeCents" >= 0);
ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_max_selections_positive" CHECK ("maxSelections" >= 1);

-- Pricing: exactly one default tier; a tier's rule is complete; prices are never negative.
CREATE UNIQUE INDEX "PriceTier_one_default" ON "PriceTier" ("isDefault") WHERE "isDefault";
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_rule_complete" CHECK (
  ("ruleBasis" = 'NONE' AND "baseTierId" IS NULL AND "multiplierBps" IS NULL)
  OR ("ruleBasis" = 'COST' AND "baseTierId" IS NULL AND "multiplierBps" > 0)
  OR ("ruleBasis" = 'TIER' AND "baseTierId" IS NOT NULL AND "baseTierId" <> "id" AND "multiplierBps" > 0)
);
ALTER TABLE "DishPrice" ADD CONSTRAINT "DishPrice_nonnegative" CHECK ("priceCents" >= 0);
ALTER TABLE "OptionPrice" ADD CONSTRAINT "OptionPrice_nonnegative" CHECK ("priceCents" >= 0);

-- Companies: a real calendar and delivery defaults; at most one default address each.
ALTER TABLE "Company"
  ADD CONSTRAINT "Company_working_days_valid"
    CHECK (cardinality("workingDays") > 0 AND "workingDays" <@ ARRAY[1,2,3,4,5,6,7]),
  ADD CONSTRAINT "Company_delivery_defaults_valid"
    CHECK ("defaultDeliveryTimeMinutes" BETWEEN 0 AND 1439 AND "deliveryLeadMinutes" BETWEEN 0 AND 600);
CREATE UNIQUE INDEX "CompanyAddress_one_default_per_company" ON "CompanyAddress" ("companyId") WHERE "isDefault";

-- Orders: real times of day, positive quantities, no negative money.
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_delivery_time_valid" CHECK ("deliveryTimeMinutes" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "Order_total_nonnegative" CHECK ("totalCents" >= 0),
  ADD CONSTRAINT "Order_lead_nonnegative" CHECK ("deliveryLeadMinutes" >= 0),
  ADD CONSTRAINT "Order_kitchen_ready_after_start"
    CHECK ("kitchenReadyAt" IS NULL OR "kitchenStartedAt" IS NOT NULL);
ALTER TABLE "OrderLine"
  ADD CONSTRAINT "OrderLine_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "OrderLine_money_nonnegative"
    CHECK ("dishUnitPriceCents" >= 0 AND "dishUnitCostCents" >= 0 AND "lineTotalCents" >= 0);
-- A combination is one prep unit: its total always equals unit price x quantity, and the
-- kitchen can't finish it before starting it (finishing an unstarted unit records both).
ALTER TABLE "OrderLineCombination"
  ADD CONSTRAINT "OrderLineCombination_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "OrderLineCombination_total_matches" CHECK ("totalCents" = "unitPriceCents" * "quantity"),
  ADD CONSTRAINT "OrderLineCombination_done_after_start"
    CHECK ("kitchenDoneAt" IS NULL OR ("kitchenStartedAt" IS NOT NULL AND "kitchenDoneAt" >= "kitchenStartedAt"));
ALTER TABLE "CombinationOption"
  ADD CONSTRAINT "CombinationOption_money_nonnegative" CHECK ("priceCents" >= 0 AND "costCents" >= 0);
ALTER TABLE "CutoffRun"
  ADD CONSTRAINT "CutoffRun_counts_nonnegative" CHECK ("cancelledCount" >= 0 AND "confirmedCount" >= 0);

-- Drops: each dispatch step needs the previous one, and "out for delivery" needs a driver.
ALTER TABLE "Drop"
  ADD CONSTRAINT "Drop_delivery_time_valid" CHECK ("deliveryTimeMinutes" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "Drop_steps_in_order"
    CHECK (("outForDeliveryAt" IS NULL OR "dispatchReadyAt" IS NOT NULL)
      AND ("deliveredAt" IS NULL OR "outForDeliveryAt" IS NOT NULL)),
  ADD CONSTRAINT "Drop_out_needs_driver" CHECK ("outForDeliveryAt" IS NULL OR "driverId" IS NOT NULL);
ALTER TABLE "DeliveryPhoto"
  ADD CONSTRAINT "DeliveryPhoto_size_valid" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 2097152);

-- Billing: an invoice always reconciles; paid status and paid date go together; no zero credits.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_total_reconciles" CHECK ("totalCents" = "ordersTotalCents" + "adjustmentsTotalCents"),
  ADD CONSTRAINT "Invoice_paid_has_date" CHECK (("status" = 'PAID') = ("paidAt" IS NOT NULL));
ALTER TABLE "BillingAdjustment" ADD CONSTRAINT "BillingAdjustment_nonzero" CHECK ("amountCents" <> 0);

-- Supabase hardening: Row Level Security on, with no policies. Supabase's public API roles
-- (anon, authenticated) can't touch these tables; our API connects as the table owner,
-- which RLS does not restrict.
ALTER TABLE "PlatformSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KitchenHoliday" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Allergen" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DietaryTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KitchenStation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortionSize" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PackagingType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Dish" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DishAllergen" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DishDietaryTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Option" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OptionAllergen" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OptionDietaryTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OptionPortion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OptionGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OptionGroupOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OptionGroupPortionSize" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyHiddenCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyHiddenMenuItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceTier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DishPrice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OptionPrice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyDomain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyAddress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyHoliday" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Employee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeAllergy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeDietaryPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderLineCombination" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CombinationOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CutoffRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Drop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryPhoto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingAdjustment" ENABLE ROW LEVEL SECURITY;
