import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables
dotenv.config();

// Import routes
import userRoutes from './routes/users';
import ruleRoutes from './routes/rules';
import commandRoutes from './routes/commands';
import auditRoutes from './routes/audit';

// Initialize Express app
const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/users', userRoutes);
app.use('/api/rules', ruleRoutes);
app.use('/api/commands', commandRoutes);
app.use('/api/audit', auditRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server with database connection check
const PORT = process.env.PORT || 3001;

prisma.$connect()
    .then(() => {
        console.log('Database connected successfully!');

        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
            console.log(`Health check: http://localhost:${PORT}/health`);
        });
    })
    .catch((error) => {
        console.error('Database connection failed:', error.message);
        process.exit(1);
    });

// Graceful shutdown
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
});

export { prisma };
