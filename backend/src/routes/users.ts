import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireAdmin } from '../middleware/auth';
import { logAudit } from '../services/auditService';
import { sendWelcomeEmail } from '../services/emailService';

const router = Router();
const prisma = new PrismaClient();

// Login endpoint - validates API key and returns user info
router.post('/login', async (req, res) => {
    const startTime = Date.now();
    console.log('[LOGIN] Request received at:', new Date().toISOString());

    try {
        const apiKey = req.headers['x-api-key'] as string || req.body.apiKey;

        if (!apiKey) {
            console.log('[LOGIN] Error: No API key provided');
            return res.status(401).json({
                error: 'Missing API key.',
                hint: 'Provide API key in X-API-Key header or request body as "apiKey"'
            });
        }

        console.log('[LOGIN] Attempting to find user with API key...');

        const user = await prisma.user.findUnique({
            where: { apiKey },
            select: {
                id: true,
                name: true,
                role: true,
                tier: true,
                credits: true,
                createdAt: true,
            },
        });

        if (!user) {
            console.log('[LOGIN] Error: Invalid API key - user not found');
            return res.status(401).json({ error: 'Invalid API key.' });
        }

        console.log(`[LOGIN] Success: User "${user.name}" logged in (${Date.now() - startTime}ms)`);

        res.json({
            message: 'Login successful',
            user,
        });
    } catch (error) {
        console.error('[LOGIN] Error occurred:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString(),
            duration: `${Date.now() - startTime}ms`,
        });
        res.status(500).json({
            error: 'Login failed.',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: {
                id: true,
                name: true,
                role: true,
                tier: true,
                credits: true,
                createdAt: true,
            },
        });

        res.json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user.' });
    }
});

// List all users (admin only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                role: true,
                tier: true,
                credits: true,
                createdAt: true,
                _count: {
                    select: { commands: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json(users);
    } catch (error) {
        console.error('Error listing users:', error);
        res.status(500).json({ error: 'Failed to list users.' });
    }
});

// Create new user (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
    try {
        const { name, email, role = 'member', tier = 'junior', credits = 100 } = req.body;

        if (!name || typeof name !== 'string') {
            return res.status(400).json({ error: 'Name is required.' });
        }

        if (!['admin', 'member'].includes(role)) {
            return res.status(400).json({ error: 'Role must be "admin" or "member".' });
        }

        if (!['junior', 'senior', 'lead'].includes(tier)) {
            return res.status(400).json({ error: 'Tier must be "junior", "senior", or "lead".' });
        }

        // Generate unique API key
        const apiKey = `${role}_${uuidv4().replace(/-/g, '')}`;

        const user = await prisma.user.create({
            data: {
                name,
                email: email || null,
                apiKey,
                role,
                tier,
                credits,
            },
        });

        await logAudit(req.user!.id, 'USER_CREATED', {
            newUserId: user.id,
            newUserName: user.name,
            role: user.role,
            tier: user.tier,
        });

        // Send welcome email if email provided
        if (email) {
            sendWelcomeEmail(email, name, apiKey, role);
        }

        // Return user with API key (only shown once!)
        res.status(201).json({
            message: 'User created successfully. Save the API key - it will only be shown once!',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                tier: user.tier,
                credits: user.credits,
                apiKey: apiKey, // Only returned on creation
            },
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user.' });
    }
});

// Update user (admin only)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, tier, credits } = req.body;

        const updateData: Record<string, unknown> = {};
        if (name) updateData.name = name;
        if (role && ['admin', 'member'].includes(role)) updateData.role = role;
        if (tier && ['junior', 'senior', 'lead'].includes(tier)) updateData.tier = tier;
        if (typeof credits === 'number' && credits >= 0) updateData.credits = credits;

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                name: true,
                role: true,
                tier: true,
                credits: true,
            },
        });

        await logAudit(req.user!.id, 'USER_UPDATED', {
            targetUserId: id,
            changes: updateData,
        });

        res.json(user);
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user.' });
    }
});

// Delete user (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent self-deletion
        if (id === req.user!.id) {
            return res.status(400).json({ error: 'Cannot delete yourself.' });
        }

        await prisma.user.delete({ where: { id } });

        await logAudit(req.user!.id, 'USER_DELETED', { deletedUserId: id });

        res.json({ message: 'User deleted successfully.' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user.' });
    }
});

// Add credits to user (admin only)
router.post('/:id/credits', authenticate, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { amount } = req.body;

        if (typeof amount !== 'number') {
            return res.status(400).json({ error: 'Amount must be a number.' });
        }

        const user = await prisma.user.update({
            where: { id },
            data: { credits: { increment: amount } },
            select: {
                id: true,
                name: true,
                credits: true,
            },
        });

        await logAudit(req.user!.id, 'CREDITS_MODIFIED', {
            targetUserId: id,
            amount,
            newBalance: user.credits,
        });

        res.json(user);
    } catch (error) {
        console.error('Error modifying credits:', error);
        res.status(500).json({ error: 'Failed to modify credits.' });
    }
});

export default router;
