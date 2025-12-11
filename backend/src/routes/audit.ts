import { Router } from 'express';
import { authenticate, requireAdmin } from '../../../../safety/backend/src/middleware/auth';
import { getAuditLogs } from '../../../../safety/backend/src/services/auditService';

const router = Router();

// Get audit logs (admin only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
    try {
        const { userId, action, limit = 100, offset = 0 } = req.query;

        const result = await getAuditLogs({
            userId: userId as string | undefined,
            action: action as string | undefined,
            limit: Number(limit),
            offset: Number(offset),
        });

        res.json(result);
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ error: 'Failed to fetch audit logs.' });
    }
});

export default router;
