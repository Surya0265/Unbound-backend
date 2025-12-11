import { PrismaClient, Rule } from '@prisma/client';

const prisma = new PrismaClient();

interface TimeRestrictions {
    allowAutoAcceptDuring?: {
        days: number[]; // 0 = Sunday, 1 = Monday, etc.
        startHour: number;
        endHour: number;
    };
}

/**
 * Validates if a pattern is valid regex
 */
export function validateRegexPattern(pattern: string): { valid: boolean; error?: string } {
    try {
        new RegExp(pattern);
        return { valid: true };
    } catch (error) {
        return {
            valid: false,
            error: `Invalid regex pattern: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

/**
 * Check if a new pattern conflicts with existing rules
 */
export async function detectRuleConflict(
    newPattern: string,
    excludeRuleId?: string
): Promise<{ hasConflict: boolean; conflictingRules: Rule[] }> {
    const existingRules = await prisma.rule.findMany({
        where: excludeRuleId ? { id: { not: excludeRuleId } } : undefined,
    });

    const conflictingRules: Rule[] = [];

    // Test strings to check for pattern overlap
    const testStrings = [
        'ls -la',
        'cat file.txt',
        'rm -rf /',
        'git status',
        'git log',
        'sudo apt-get install',
        'docker run nginx',
        ':(){ :|:& };:',
        'mkfs.ext4 /dev/sda',
        'echo hello',
        'pwd',
    ];

    const newRegex = new RegExp(newPattern);

    for (const rule of existingRules) {
        try {
            const existingRegex = new RegExp(rule.pattern);

            // Check if any test string matches both patterns
            for (const testStr of testStrings) {
                if (newRegex.test(testStr) && existingRegex.test(testStr)) {
                    conflictingRules.push(rule);
                    break;
                }
            }
        } catch {
            // Skip invalid existing patterns
            continue;
        }
    }

    return {
        hasConflict: conflictingRules.length > 0,
        conflictingRules,
    };
}

/**
 * Check if current time is within allowed time restrictions
 */
export function isWithinTimeRestrictions(timeRestrictions: TimeRestrictions | null): boolean {
    if (!timeRestrictions?.allowAutoAcceptDuring) {
        return false; // No time-based auto-accept
    }

    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    const { days, startHour, endHour } = timeRestrictions.allowAutoAcceptDuring;

    const isAllowedDay = days.includes(currentDay);
    const isAllowedHour = currentHour >= startHour && currentHour < endHour;

    return isAllowedDay && isAllowedHour;
}

/**
 * Match a command against rules and return the first matching rule
 */
export async function matchCommand(commandText: string): Promise<Rule | null> {
    const rules = await prisma.rule.findMany({
        orderBy: { priority: 'desc' },
    });

    for (const rule of rules) {
        try {
            const regex = new RegExp(rule.pattern);
            if (regex.test(commandText)) {
                return rule;
            }
        } catch {
            // Skip invalid patterns
            continue;
        }
    }

    return null;
}

/**
 * Get effective action considering time restrictions
 */
export function getEffectiveAction(rule: Rule): 'AUTO_ACCEPT' | 'AUTO_REJECT' | 'REQUIRE_APPROVAL' {
    // If rule requires approval but we're within allowed time window, auto-accept
    if (rule.action === 'REQUIRE_APPROVAL') {
        const timeRestrictions = rule.timeRestrictions as TimeRestrictions | null;
        if (isWithinTimeRestrictions(timeRestrictions)) {
            return 'AUTO_ACCEPT';
        }
    }

    return rule.action;
}

/**
 * Calculate required approvals based on user tier
 */
export function getRequiredApprovals(baseThreshold: number, userTier: string): number {
    switch (userTier) {
        case 'lead':
            return Math.max(1, Math.floor(baseThreshold * 0.5)); // 50% of threshold
        case 'senior':
            return Math.max(1, Math.floor(baseThreshold * 0.75)); // 75% of threshold
        case 'junior':
        default:
            return baseThreshold; // Full threshold
    }
}
