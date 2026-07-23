-- CreateTable
CREATE TABLE "system_health_checks" (
    "id" SERIAL NOT NULL,
    "note" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_health_checks_pkey" PRIMARY KEY ("id")
);
