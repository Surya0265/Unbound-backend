import { PrismaClient, User, Command } from '@prisma/client';
import { logAudit } from './auditService';

const prisma = new PrismaClient();

/**
 * Execute a command (mocked) - deduct credits and log execution
 * Uses a transaction to ensure atomicity
 */
export async function executeCommand(
    user: User,
    command: Command
): Promise<{ success: boolean; newBalance: number; error?: string }> {
    try {
        // Use transaction for atomic operations
        const result = await prisma.$transaction(async (tx) => {
            // Check credits again within transaction
            const currentUser = await tx.user.findUnique({
                where: { id: user.id },
            });

            if (!currentUser || currentUser.credits <= 0) {
                throw new Error('Insufficient credits');
            }

            // Deduct credit
            const updatedUser = await tx.user.update({
                where: { id: user.id },
                data: { credits: { decrement: 1 } },
            });

            // Update command status
            await tx.command.update({
                where: { id: command.id },
                data: {
                    status: 'executed',
                    executedAt: new Date(),
                },
            });

            // Log the execution (simulated)
            console.log(`[MOCK EXECUTION] User: ${user.name}, Command: ${command.commandText}`);
            console.log(`[MOCK OUTPUT] Command executed successfully (simulated)`);

            return { newBalance: updatedUser.credits };
        });

        // Log to audit trail
        await logAudit(user.id, 'COMMAND_EXECUTED', {
            commandId: command.id,
            commandText: command.commandText,
            previousCredits: user.credits,
            newCredits: result.newBalance,
        });

        return { success: true, newBalance: result.newBalance };
    } catch (error) {
        console.error('Execution error:', error);

        // Log failed execution attempt
        await logAudit(user.id, 'COMMAND_EXECUTION_FAILED', {
            commandId: command.id,
            commandText: command.commandText,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        return {
            success: false,
            newBalance: user.credits,
            error: error instanceof Error ? error.message : 'Execution failed',
        };
    }
}

/**
 * Reject a command and log the rejection
 */
export async function rejectCommand(
    user: User,
    command: Command,
    reason: string
): Promise<void> {
    await prisma.command.update({
        where: { id: command.id },
        data: { status: 'rejected' },
    });

    await logAudit(user.id, 'COMMAND_REJECTED', {
        commandId: command.id,
        commandText: command.commandText,
        reason,
    });
}

/**
 * Mark command as awaiting approval
 */
export async function setAwaitingApproval(
    user: User,
    command: Command,
    requiredApprovals: number
): Promise<void> {
    await prisma.command.update({
        where: { id: command.id },
        data: { status: 'awaiting_approval' },
    });

    await logAudit(user.id, 'COMMAND_PENDING_APPROVAL', {
        commandId: command.id,
        commandText: command.commandText,
        requiredApprovals,
    });
}
