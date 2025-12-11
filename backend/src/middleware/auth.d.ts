import { Request, Response, NextFunction } from 'express';
import { User } from '@prisma/client';
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
export declare function authenticate(req: Request, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Admin-only middleware - must be used after authenticate
 */
export declare function requireAdmin(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
/**
 * Credits check middleware - ensures user has credits > 0
 */
export declare function requireCredits(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=auth.d.ts.map