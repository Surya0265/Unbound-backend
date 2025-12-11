"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireAdmin = requireAdmin;
exports.requireCredits = requireCredits;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
/**
 * Authentication middleware - validates API key from X-API-Key header
 */
async function authenticate(req, res, next) {
    const apiKey = req.headers['x-api-key'];
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
    }
    catch (error) {
        console.error('Auth error:', error);
        return res.status(500).json({ error: 'Authentication failed.' });
    }
}
/**
 * Admin-only middleware - must be used after authenticate
 */
function requireAdmin(req, res, next) {
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
function requireCredits(req, res, next) {
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
//# sourceMappingURL=auth.js.map