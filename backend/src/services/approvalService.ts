import { PrismaClient, User, Command } from '@prisma/client';
import { getRequiredApprovals } from './ruleEngine';
import { executeCommand } from './commandExecutor';
import { logAudit } from './auditService';

const prisma = new PrismaClient();

const ESCALATION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

/**
 * Add an approval vote for a command
 */
export async function addApproval(
    command: Command,
    approver: User,
    decision: 'approved' | 'rejected'
): Promise<{
    success: boolean;
    commandStatus: string;
    message: string;
    newBalance?: number;
}> {
    // Check if approver has already voted
    const existingApproval = await prisma.approval.findUnique({
        where: {
            commandId_approverId: {
                commandId: command.id,
                approverId: approver.id,
            },
        },
    });

    if (existingApproval) {
        return {
            success: false,
            commandStatus: command.status,
            message: 'You have already voted on this command.',
        };
    }

    // Create approval record
    await prisma.approval.create({
        data: {
            commandId: command.id,
            approverId: approver.id,
            decision,
        },
    });

    await logAudit(approver.id, `COMMAND_${decision.toUpperCase()}`, {
        commandId: command.id,
        commandText: command.commandText,
    });

    // If rejected, update command status
    if (decision === 'rejected') {
        await prisma.command.update({
            where: { id: command.id },
            data: { status: 'rejected' },
        });

        return {
            success: true,
            commandStatus: 'rejected',
            message: 'Command has been rejected.',
        };
    }

    // Count approvals
    const approvalCount = await prisma.approval.count({
        where: {
            commandId: command.id,
            decision: 'approved',
        },
    });

    // Get the command owner and matched rule
    const commandWithDetails = await prisma.command.findUnique({
        where: { id: command.id },
        include: {
            user: true,
            matchedRule: true,
        },
    });

    if (!commandWithDetails) {
        return {
            success: false,
            commandStatus: 'pending',
            message: 'Command not found.',
        };
    }

    const baseThreshold = commandWithDetails.matchedRule?.approvalThreshold || 1;
    const requiredApprovals = getRequiredApprovals(baseThreshold, commandWithDetails.user.tier);

    // Check if we have enough approvals
    if (approvalCount >= requiredApprovals) {
        // Execute the command
        const result = await executeCommand(commandWithDetails.user, commandWithDetails);

        if (result.success) {
            return {
                success: true,
                commandStatus: 'executed',
                message: `Command approved and executed. New balance: ${result.newBalance}`,
                newBalance: result.newBalance,
            };
        } else {
            return {
                success: false,
                commandStatus: 'pending',
                message: result.error || 'Execution failed.',
            };
        }
    }

    return {
        success: true,
        commandStatus: 'awaiting_approval',
        message: `Approval recorded. ${approvalCount}/${requiredApprovals} approvals received.`,
    };
}

/**
 * Get pending commands that need escalation
 */
export async function getPendingEscalations(): Promise<Command[]> {
    const cutoffTime = new Date(Date.now() - ESCALATION_TIMEOUT_MS);

    return prisma.command.findMany({
        where: {
            status: 'awaiting_approval',
            createdAt: { lt: cutoffTime },
        },
        include: {
            user: true,
            matchedRule: true,
            approvals: true,
        },
    });
}

/**
 * Escalate a command to admin (mark for priority review)
 */
export async function escalateToAdmin(command: Command): Promise<void> {
    await logAudit(command.userId, 'COMMAND_ESCALATED', {
        commandId: command.id,
        commandText: command.commandText,
        reason: 'Approval timeout exceeded',
    });

    // In a real system, this would send notifications to admins
    console.log(`[ESCALATION] Command ${command.id} escalated to admin review`);
}

/**
 * Get pending approvals for an admin
 */
export async function getPendingApprovals(): Promise<Command[]> {
    return prisma.command.findMany({
        where: { status: 'awaiting_approval' },
        orderBy: { createdAt: 'asc' },
        include: {
            user: {
                select: { name: true, tier: true },
            },
            matchedRule: {
                select: { pattern: true, approvalThreshold: true },
            },
            approvals: {
                include: {
                    approver: {
                        select: { name: true },
                    },
                },
            },
        },
    });
}
