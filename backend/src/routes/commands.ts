import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireAdmin, requireCredits } from '../../../../safety/backend/src/middleware/auth';
import { matchCommand, getEffectiveAction, getRequiredApprovals } from '../../../../safety/backend/src/services/ruleEngine';
import { executeCommand, rejectCommand, setAwaitingApproval } from '../../../../safety/backend/src/services/commandExecutor';
import { addApproval, getPendingApprovals } from '../../../../safety/backend/src/services/approvalService';
import { logAudit } from '../../../../safety/backend/src/services/auditService';

const router = Router();
const prisma = new PrismaClient();

// Submit a command
router.post('/', authenticate, async (req, res) => {
    try {
        const { command_text } = req.body;

        if (!command_text || typeof command_text !== 'string') {
            return res.status(400).json({ error: 'command_text is required.' });
        }

        const user = req.user!;

        // Check credits first
        if (user.credits <= 0) {
            return res.status(403).json({
                error: 'Insufficient credits.',
                credits: user.credits,
            });
        }

        // Check if user has a pending/approved command with same text that can be executed
        const existingCommand = await prisma.command.findFirst({
            where: {
                userId: user.id,
                commandText: command_text,
                status: 'awaiting_approval',
            },
            include: {
                matchedRule: true,
                approvals: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        // If there's an existing command awaiting approval, check if it has enough approvals
        if (existingCommand && existingCommand.matchedRule) {
            const approvalCount = existingCommand.approvals.filter(a => a.decision === 'approved').length;
            const requiredApprovals = getRequiredApprovals(
                existingCommand.matchedRule.approvalThreshold,
                user.tier
            );

            if (approvalCount >= requiredApprovals) {
                // Execute the already-approved command
                const result = await executeCommand(user, existingCommand);

                if (result.success) {
                    return res.json({
                        id: existingCommand.id,
                        status: 'executed',
                        message: 'Command executed successfully (previously approved).',
                        new_balance: result.newBalance,
                    });
                }
            } else {
                // Still awaiting more approvals
                return res.json({
                    id: existingCommand.id,
                    status: 'awaiting_approval',
                    message: `Command still requires approval. ${approvalCount}/${requiredApprovals} received.`,
                    credits: user.credits,
                });
            }
        }

        // Create new command record
        const command = await prisma.command.create({
            data: {
                userId: user.id,
                commandText: command_text,
                status: 'pending',
            },
        });

        // Match against rules
        const matchedRule = await matchCommand(command_text);

        if (!matchedRule) {
            // No matching rule - auto reject for safety
            await rejectCommand(user, command, 'No matching rule found');

            return res.json({
                id: command.id,
                status: 'rejected',
                reason: 'No matching rule found. Command rejected for safety.',
                credits: user.credits,
            });
        }

        // Update command with matched rule
        await prisma.command.update({
            where: { id: command.id },
            data: { matchedRuleId: matchedRule.id },
        });

        // Get effective action (considering time restrictions)
        const effectiveAction = getEffectiveAction(matchedRule);

        switch (effectiveAction) {
            case 'AUTO_ACCEPT': {
                const result = await executeCommand(user, command);

                if (result.success) {
                    return res.json({
                        id: command.id,
                        status: 'executed',
                        message: 'Command executed successfully.',
                        new_balance: result.newBalance,
                    });
                } else {
                    return res.status(500).json({
                        id: command.id,
                        status: 'pending',
                        error: result.error,
                        credits: user.credits,
                    });
                }
            }

            case 'AUTO_REJECT': {
                await rejectCommand(user, command, `Matched dangerous pattern: ${matchedRule.pattern}`);

                return res.json({
                    id: command.id,
                    status: 'rejected',
                    reason: `Command rejected: matches dangerous pattern "${matchedRule.pattern}"`,
                    credits: user.credits,
                });
            }

            case 'REQUIRE_APPROVAL': {
                const requiredApprovals = getRequiredApprovals(matchedRule.approvalThreshold, user.tier);
                await setAwaitingApproval(user, command, requiredApprovals);

                return res.json({
                    id: command.id,
                    status: 'awaiting_approval',
                    message: `Command requires ${requiredApprovals} admin approval(s).`,
                    credits: user.credits,
                });
            }
        }
    } catch (error) {
        console.error('Error submitting command:', error);
        res.status(500).json({ error: 'Failed to submit command.' });
    }
});

// Get command history for current user
router.get('/', authenticate, async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;

        const where = req.user!.role === 'admin'
            ? {}
            : { userId: req.user!.id };

        const [commands, total] = await Promise.all([
            prisma.command.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: Number(limit),
                skip: Number(offset),
                include: {
                    user: {
                        select: { name: true },
                    },
                    matchedRule: {
                        select: { pattern: true, action: true },
                    },
                    approvals: {
                        include: {
                            approver: {
                                select: { name: true },
                            },
                        },
                    },
                },
            }),
            prisma.command.count({ where }),
        ]);

        res.json({ commands, total });
    } catch (error) {
        console.error('Error fetching commands:', error);
        res.status(500).json({ error: 'Failed to fetch commands.' });
    }
});

// Get single command
router.get('/:id', authenticate, async (req, res) => {
    try {
        const command = await prisma.command.findUnique({
            where: { id: req.params.id },
            include: {
                user: {
                    select: { name: true, tier: true },
                },
                matchedRule: true,
                approvals: {
                    include: {
                        approver: {
                            select: { name: true },
                        },
                    },
                },
            },
        });

        if (!command) {
            return res.status(404).json({ error: 'Command not found.' });
        }

        // Check access
        if (req.user!.role !== 'admin' && command.userId !== req.user!.id) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        res.json(command);
    } catch (error) {
        console.error('Error fetching command:', error);
        res.status(500).json({ error: 'Failed to fetch command.' });
    }
});

// Get pending approvals (admin only)
router.get('/pending/approvals', authenticate, requireAdmin, async (req, res) => {
    try {
        const pending = await getPendingApprovals();
        res.json(pending);
    } catch (error) {
        console.error('Error fetching pending approvals:', error);
        res.status(500).json({ error: 'Failed to fetch pending approvals.' });
    }
});

// Approve or reject a command (admin only)
router.post('/:id/approve', authenticate, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { decision } = req.body;

        if (!decision || !['approved', 'rejected'].includes(decision)) {
            return res.status(400).json({ error: 'Decision must be "approved" or "rejected".' });
        }

        const command = await prisma.command.findUnique({
            where: { id },
        });

        if (!command) {
            return res.status(404).json({ error: 'Command not found.' });
        }

        if (command.status !== 'awaiting_approval') {
            return res.status(400).json({
                error: 'Command is not awaiting approval.',
                currentStatus: command.status,
            });
        }

        const result = await addApproval(command, req.user!, decision);

        res.json(result);
    } catch (error) {
        console.error('Error approving command:', error);
        res.status(500).json({ error: 'Failed to process approval.' });
    }
});

// Resubmit a previously rejected/pending command
router.post('/:id/resubmit', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const command = await prisma.command.findUnique({
            where: { id },
            include: { matchedRule: true },
        });

        if (!command) {
            return res.status(404).json({ error: 'Command not found.' });
        }

        if (command.userId !== req.user!.id) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        if (command.status === 'executed') {
            return res.status(400).json({ error: 'Command was already executed.' });
        }

        // Check if there are approvals
        const approvalCount = await prisma.approval.count({
            where: {
                commandId: id,
                decision: 'approved',
            },
        });

        if (!command.matchedRule) {
            return res.status(400).json({ error: 'No matched rule for this command.' });
        }

        const requiredApprovals = getRequiredApprovals(
            command.matchedRule.approvalThreshold,
            req.user!.tier
        );

        if (approvalCount >= requiredApprovals) {
            // Execute the command
            const result = await executeCommand(req.user!, command);

            if (result.success) {
                return res.json({
                    id: command.id,
                    status: 'executed',
                    message: 'Command executed successfully after approval.',
                    new_balance: result.newBalance,
                });
            }
        }

        res.json({
            id: command.id,
            status: command.status,
            message: `Still awaiting approvals. ${approvalCount}/${requiredApprovals} received.`,
        });
    } catch (error) {
        console.error('Error resubmitting command:', error);
        res.status(500).json({ error: 'Failed to resubmit command.' });
    }
});

export default router;
