-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CriticalAction" ADD VALUE 'AUTHORIZATION_APPROVED';
ALTER TYPE "CriticalAction" ADD VALUE 'AUTHORIZATION_REJECTED';
ALTER TYPE "CriticalAction" ADD VALUE 'SUSPICIOUS_LOGIN';
ALTER TYPE "CriticalAction" ADD VALUE 'FAILED_LOGIN_LOCKOUT';
ALTER TYPE "CriticalAction" ADD VALUE 'APPROVAL_REQUESTED';
ALTER TYPE "CriticalAction" ADD VALUE 'APPROVAL_GRANTED';
ALTER TYPE "CriticalAction" ADD VALUE 'APPROVAL_DENIED';
ALTER TYPE "CriticalAction" ADD VALUE 'EXPENSE_VOIDING';
ALTER TYPE "CriticalAction" ADD VALUE 'REFUND_PROCESS';
ALTER TYPE "CriticalAction" ADD VALUE 'STOCK_TAKE_ADJUST';
