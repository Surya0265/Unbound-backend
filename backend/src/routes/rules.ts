import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireAdmin } from '../../../../safety/backend/src/middleware/auth';
import { validateRegexPattern, detectRuleConflict } from '../../../../safety/backend/src/services/ruleEngine';
import { logAudit } from '../../../../safety/backend/src/services/auditService';

const router = Router();
const prisma = new PrismaClient();

// List all rules
router.get('/', authenticate, async (req, res) => {
    try {
        const rules = await prisma.rule.findMany({
            orderBy: { priority: 'desc' },
            include: {
                createdBy: {
                    select: { name: true },
                },
            },
        });

        res.json(rules);
    } catch (error) {
        console.error('Error listing rules:', error);
        res.status(500).json({ error: 'Failed to list rules.' });
    }
});

// Get single rule
router.get('/:id', authenticate, async (req, res) => {
    try {
        const rule = await prisma.rule.findUnique({
            where: { id: req.params.id },
            include: {
                createdBy: {
                    select: { name: true },
                },
            },
        });

        if (!rule) {
            return res.status(404).json({ error: 'Rule not found.' });
        }

        res.json(rule);
    } catch (error) {
        console.error('Error fetching rule:', error);
        res.status(500).json({ error: 'Failed to fetch rule.' });
    }
});

// Create new rule (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
    try {
        const { pattern, action, priority = 0, approvalThreshold = 1, timeRestrictions } = req.body;

        // Validate required fields
        if (!pattern || typeof pattern !== 'string') {
            return res.status(400).json({ error: 'Pattern is required.' });
        }

        if (!action || !['AUTO_ACCEPT', 'AUTO_REJECT', 'REQUIRE_APPROVAL'].includes(action)) {
            return res.status(400).json({
                error: 'Action must be "AUTO_ACCEPT", "AUTO_REJECT", or "REQUIRE_APPROVAL".'
            });
        }

        // Validate regex pattern
        const validation = validateRegexPattern(pattern);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        // Check for conflicts
        const conflicts = await detectRuleConflict(pattern);
        if (conflicts.hasConflict) {
            return res.status(400).json({
                error: 'Pattern conflicts with existing rules.',
                conflictingRules: conflicts.conflictingRules.map(r => ({
                    id: r.id,
                    pattern: r.pattern,
                    action: r.action,
                })),
            });
        }

        const rule = await prisma.rule.create({
            data: {
                pattern,
                action,
                priority,
                approvalThreshold,
                timeRestrictions,
                createdById: req.user!.id,
            },
        });

        await logAudit(req.user!.id, 'RULE_CREATED', {
            ruleId: rule.id,
            pattern: rule.pattern,
            action: rule.action,
        });

        res.status(201).json(rule);
    } catch (error) {
        console.error('Error creating rule:', error);
        res.status(500).json({ error: 'Failed to create rule.' });
    }
});

// Update rule (admin only)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { pattern, action, priority, approvalThreshold, timeRestrictions } = req.body;

        const updateData: Record<string, unknown> = {};

        // Validate and update pattern if provided
        if (pattern) {
            const validation = validateRegexPattern(pattern);
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }

            // Check for conflicts (excluding current rule)
            const conflicts = await detectRuleConflict(pattern, id);
            if (conflicts.hasConflict) {
                return res.status(400).json({
                    error: 'Pattern conflicts with existing rules.',
                    conflictingRules: conflicts.conflictingRules.map(r => ({
                        id: r.id,
                        pattern: r.pattern,
                        action: r.action,
                    })),
                });
            }

            updateData.pattern = pattern;
        }

        if (action && ['AUTO_ACCEPT', 'AUTO_REJECT', 'REQUIRE_APPROVAL'].includes(action)) {
            updateData.action = action;
        }

        if (typeof priority === 'number') updateData.priority = priority;
        if (typeof approvalThreshold === 'number') updateData.approvalThreshold = approvalThreshold;
        if (timeRestrictions !== undefined) updateData.timeRestrictions = timeRestrictions;

        const rule = await prisma.rule.update({
            where: { id },
            data: updateData,
        });

        await logAudit(req.user!.id, 'RULE_UPDATED', {
            ruleId: id,
            changes: updateData,
        });

        res.json(rule);
    } catch (error) {
        console.error('Error updating rule:', error);
        res.status(500).json({ error: 'Failed to update rule.' });
    }
});

// Delete rule (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        await prisma.rule.delete({ where: { id } });

        await logAudit(req.user!.id, 'RULE_DELETED', { ruleId: id });

        res.json({ message: 'Rule deleted successfully.' });
    } catch (error) {
        console.error('Error deleting rule:', error);
        res.status(500).json({ error: 'Failed to delete rule.' });
    }
});

// Test a pattern against a command (admin only)
router.post('/test', authenticate, requireAdmin, async (req, res) => {
    try {
        const { pattern, testCommand } = req.body;

        if (!pattern || !testCommand) {
            return res.status(400).json({ error: 'Pattern and testCommand are required.' });
        }

        const validation = validateRegexPattern(pattern);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const regex = new RegExp(pattern);
        const matches = regex.test(testCommand);

        res.json({
            pattern,
            testCommand,
            matches,
        });
    } catch (error) {
        console.error('Error testing pattern:', error);
        res.status(500).json({ error: 'Failed to test pattern.' });
    }
});

export default router;
