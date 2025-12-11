import { Request, Response, NextFunction } from 'express';
import { PrismaClient, User } from '@prisma/client';

const prisma = new PrismaClient();

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: User;
        }
    }
}

/**
 * Authentication middleware - validates API key from X-API-Key header
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
        return res.status(401).json({ error: 'Missing API key. Provide X-API-Key header.' });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { apiKey },
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid API key.' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        return res.status(500).json({ error: 'Authentication failed.' });
    }
}

/**
 * Admin-only middleware - must be used after authenticate
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }

    next();
}

/**
 * Credits check middleware - ensures user has credits > 0
 */
export function requireCredits(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }

    if (req.user.credits <= 0) {
        return res.status(403).json({
            error: 'Insufficient credits.',
            credits: req.user.credits
        });
    }

    next();
}
