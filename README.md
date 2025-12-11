# Command Gateway Backend

A secure command execution gateway with rule-based access control, approval workflows, and audit logging.

---

## Project Structure

```
backend/
├── src/
│   ├── index.ts              # Express app entry point
│   ├── routes/
│   │   ├── users.ts          # User management endpoints
│   │   ├── rules.ts          # Rule management endpoints  
│   │   ├── commands.ts       # Command submission & approval endpoints
│   │   └── audit.ts          # Audit log endpoints
│   └── services/
│       ├── approvalService.ts   # Approval workflow logic
│       ├── auditService.ts      # Audit logging service
│       ├── commandExecutor.ts   # Command execution logic
│       └── ruleEngine.ts        # Rule matching & validation
├── prisma/
│   └── schema.prisma         # Database schema definition
├── db schema.png             # Database ER diagram
├── package.json
└── tsconfig.json
```

---

## Database Schema

![Database Schema](backend/db%20schema.png)

---

## API Endpoints

All endpoints require authentication via `X-API-Key` header.

### Authentication

| Header | Description |
|--------|-------------|
| `X-API-Key` | User's API key (e.g., `admin_xxxxxxxxxx`) |

---

### Users API (`/api/users`)

#### GET /api/users/me
Get current authenticated user details.

| Request | Response |
|---------|----------|
| *No body required* | `{ id, name, role, tier, credits, createdAt }` |

---

#### GET /api/users
List all users (Admin only).

| Request | Response |
|---------|----------|
| *No body required* | `[{ id, name, role, tier, credits, createdAt, _count: { commands } }]` |

---

#### POST /api/users
Create a new user (Admin only).

| Request Body | Response |
|--------------|----------|
| `{ name: string, role?: "admin" \| "member", tier?: "junior" \| "senior" \| "lead", credits?: number }` | `{ message, user: { id, name, role, tier, credits, apiKey } }` |

---

#### PUT /api/users/:id
Update a user (Admin only).

| Request Body | Response |
|--------------|----------|
| `{ name?, role?, tier?, credits? }` | `{ id, name, role, tier, credits }` |

---

#### DELETE /api/users/:id
Delete a user (Admin only).

| Request | Response |
|---------|----------|
| *No body required* | `{ message: "User deleted successfully." }` |

---

#### POST /api/users/:id/credits
Add credits to a user (Admin only).

| Request Body | Response |
|--------------|----------|
| `{ amount: number }` | `{ id, name, credits }` |

---

### Rules API (`/api/rules`)

#### GET /api/rules
List all rules.

| Request | Response |
|---------|----------|
| *No body required* | `[{ id, pattern, action, priority, approvalThreshold, timeRestrictions, createdAt, createdBy: { name } }]` |

---

#### GET /api/rules/:id
Get a single rule.

| Request | Response |
|---------|----------|
| *No body required* | `{ id, pattern, action, priority, approvalThreshold, timeRestrictions, createdAt, createdBy: { name } }` |

---

#### POST /api/rules
Create a new rule (Admin only).

| Request Body | Response |
|--------------|----------|
| `{ pattern: string, action: "AUTO_ACCEPT" \| "AUTO_REJECT" \| "REQUIRE_APPROVAL", priority?: number, approvalThreshold?: number, timeRestrictions?: object }` | `{ id, pattern, action, priority, approvalThreshold, timeRestrictions, createdAt }` |

---

#### PUT /api/rules/:id
Update a rule (Admin only).

| Request Body | Response |
|--------------|----------|
| `{ pattern?, action?, priority?, approvalThreshold?, timeRestrictions? }` | `{ id, pattern, action, priority, approvalThreshold, timeRestrictions }` |

---

#### DELETE /api/rules/:id
Delete a rule (Admin only).

| Request | Response |
|---------|----------|
| *No body required* | `{ message: "Rule deleted successfully." }` |

---

#### POST /api/rules/test
Test a pattern against a command (Admin only).

| Request Body | Response |
|--------------|----------|
| `{ pattern: string, testCommand: string }` | `{ pattern, testCommand, matches: boolean }` |

---

### Commands API (`/api/commands`)

#### POST /api/commands
Submit a command for execution.

| Request Body | Response |
|--------------|----------|
| `{ command_text: string }` | `{ id, status: "executed" \| "rejected" \| "awaiting_approval", message?, reason?, new_balance?, credits? }` |

**Status Flow:**
- `executed` - Command was auto-accepted and executed
- `rejected` - Command was rejected (dangerous pattern or no matching rule)
- `awaiting_approval` - Command requires admin approval

---

#### GET /api/commands
Get command history.

| Query Params | Response |
|--------------|----------|
| `limit?: number, offset?: number` | `{ commands: [...], total: number }` |

---

#### GET /api/commands/:id
Get a single command.

| Request | Response |
|---------|----------|
| *No body required* | `{ id, commandText, status, userId, matchedRule, approvals, createdAt, executedAt }` |

---

#### GET /api/commands/pending/approvals
Get commands pending approval (Admin only).

| Request | Response |
|---------|----------|
| *No body required* | `[{ id, commandText, status, user, matchedRule, approvals }]` |

---

#### POST /api/commands/:id/approve
Approve or reject a command (Admin only).

| Request Body | Response |
|--------------|----------|
| `{ decision: "approved" \| "rejected" }` | `{ status, message, approvalsReceived?, approvalsRequired? }` |

---

#### POST /api/commands/:id/resubmit
Resubmit a previously rejected/pending command.

| Request | Response |
|---------|----------|
| *No body required* | `{ id, status, message, new_balance? }` |

---

### Audit API (`/api/audit`)

#### GET /api/audit
Get audit logs (Admin only).

| Query Params | Response |
|--------------|----------|
| `userId?: string, action?: string, limit?: number, offset?: number` | `{ logs: [...], total: number }` |

---

## Postman Collection

A complete Postman collection is included: **`Command_Gateway_API.postman_collection.json`**

### Import Instructions

1. Open Postman
2. Click **Import** -> Select `Command_Gateway_API.postman_collection.json`
3. Update collection variables:
   - `baseUrl`: `http://localhost:3001`
   - `adminApiKey`: Your admin API key
   - `memberApiKey`: Your member API key

### Included Endpoints

| Category | Endpoints |
|----------|-----------|
| Health | Health Check |
| Users | Get Current User, List All Users, Create User, Update User, Delete User, Add Credits |
| Rules | List Rules, Get Rule, Create Rule, Update Rule, Delete Rule, Test Pattern |
| Commands | Submit Command, Get History, Get Command, Pending Approvals, Approve/Reject, Resubmit |
| Audit | Get Audit Logs |

---

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

Server runs on `http://localhost:3001`

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `PORT` | Server port (default: 3001) | No |
| `SMTP_HOST` | SMTP server hostname (e.g., smtp.gmail.com) | No |
| `SMTP_PORT` | SMTP port (587 for TLS, 465 for SSL) | No |
| `SMTP_USER` | SMTP username/email | No |
| `SMTP_PASS` | SMTP password or app password | No |
| `SMTP_FROM` | Sender email address | No |

> **Note:** Email notifications are optional. If SMTP is not configured, the app works without email.

---

## Email Notifications

When SMTP is configured, the system sends emails for:

| Event | Recipient | Description |
|-------|-----------|-------------|
| Command Pending | All Admins | New command requires approval |
| Command Approved/Rejected | User | Approval decision notification |
| User Created | New User | Welcome email with API key |

---

## Role & Tier System

### Roles
| Role | Permissions |
|------|-------------|
| `admin` | Full access to all endpoints |
| `member` | Limited to own commands and read-only rules |

### Tiers
| Tier | Approval Threshold |
|------|-------------------|
| `junior` | Base threshold |
| `senior` | Threshold - 1 |
| `lead` | Threshold - 2 |

---

## Rule Actions

| Action | Behavior |
|--------|----------|
| `AUTO_ACCEPT` | Command executes immediately |
| `AUTO_REJECT` | Command is rejected |
| `REQUIRE_APPROVAL` | Command queued for admin approval |
