import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    // Create admin user 1 - Surya Prakash
    const admin1ApiKey = `admin_${uuidv4().replace(/-/g, '')}`;
    const admin = await prisma.user.upsert({
        where: { apiKey: 'admin_default_key_12345' },
        update: {},
        create: {
            name: 'Surya Prakash',
            email: 'suryaprakashb265@gmail.com',
            apiKey: admin1ApiKey,
            role: 'admin',
            tier: 'lead',
            credits: 1000,
        },
    });
    console.log(`Admin 1 created with API key: ${admin1ApiKey}`);

    // Create admin user 2 - Surya Balakrishnan
    const admin2ApiKey = `admin_${uuidv4().replace(/-/g, '')}`;
    await prisma.user.upsert({
        where: { apiKey: 'admin_default_key_67890' },
        update: {},
        create: {
            name: 'Surya Balakrishnan',
            email: 'suryabalakrishnan265@gmail.com',
            apiKey: admin2ApiKey,
            role: 'admin',
            tier: 'lead',
            credits: 1000,
        },
    });
    console.log(`Admin 2 created with API key: ${admin2ApiKey}`);

    // Create a test member user
    const memberApiKey = `member_${uuidv4().replace(/-/g, '')}`;
    await prisma.user.upsert({
        where: { apiKey: 'member_default_key_12345' },
        update: {},
        create: {
            name: 'Test Member',
            email: '23n257@psgtech.ac.in',
            apiKey: memberApiKey,
            role: 'member',
            tier: 'junior',
            credits: 100,
        },
    });
    console.log(`Member created with API key: ${memberApiKey}`);

    // Seed default rules
    const defaultRules = [
        {
            pattern: String.raw`:\(\)\{ :\|:& \};:`,
            action: 'AUTO_REJECT' as const,
            priority: 100,
            approvalThreshold: 1,
        },
        {
            pattern: String.raw`rm\s+-rf\s+/`,
            action: 'AUTO_REJECT' as const,
            priority: 99,
            approvalThreshold: 1,
        },
        {
            pattern: String.raw`mkfs\.`,
            action: 'AUTO_REJECT' as const,
            priority: 98,
            approvalThreshold: 1,
        },
        {
            pattern: String.raw`git\s+(status|log|diff)`,
            action: 'AUTO_ACCEPT' as const,
            priority: 50,
            approvalThreshold: 1,
        },
        {
            pattern: String.raw`^(ls|cat|pwd|echo)`,
            action: 'AUTO_ACCEPT' as const,
            priority: 49,
            approvalThreshold: 1,
        },
        {
            pattern: String.raw`sudo\s+`,
            action: 'REQUIRE_APPROVAL' as const,
            priority: 80,
            approvalThreshold: 2,
        },
        {
            pattern: String.raw`docker\s+(run|exec)`,
            action: 'REQUIRE_APPROVAL' as const,
            priority: 75,
            approvalThreshold: 1,
            timeRestrictions: {
                allowAutoAcceptDuring: {
                    days: [1, 2, 3, 4, 5], // Monday to Friday
                    startHour: 9,
                    endHour: 18,
                },
            },
        },
    ];

    for (const rule of defaultRules) {
        await prisma.rule.create({
            data: {
                ...rule,
                createdById: admin.id,
            },
        });
    }
    console.log(`Created ${defaultRules.length} default rules`);

    console.log('Seeding completed!');
    console.log('\nDefault credentials:');
    console.log(`   Admin 1 API Key: ${admin1ApiKey}`);
    console.log(`   Admin 2 API Key: ${admin2ApiKey}`);
    console.log(`   Member API Key: ${memberApiKey}`);
}

main()
    .catch((e) => {
        console.error('Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
