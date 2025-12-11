import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Log an action to the audit trail
 */
export async function logAudit(
    userId: string,
    action: string,
    details: Record<string, unknown>
): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                userId,
                action,
                details: details as object,
            },
        });
    } catch (error) {
        console.error('Failed to log audit:', error);
        // Don't throw - audit logging should not break the main flow
    }
}

/**
 * Get audit logs with optional filtering
 */
export async function getAuditLogs(options: {
    userId?: string;
    action?: string;
    limit?: number;
    offset?: number;
}) {
    const { userId, action, limit = 100, offset = 0 } = options;

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
            include: {
                user: {
                    select: { name: true, role: true },
                },
            },
        }),
        prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
}
