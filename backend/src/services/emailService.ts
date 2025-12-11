import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Create transporter with SMTP config from environment
const createTransporter = () => {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !port || !user || !pass) {
        console.log('Email notifications disabled: SMTP not configured');
        return null;
    }

    return nodemailer.createTransport({
        host,
        port: parseInt(port),
        secure: parseInt(port) === 465,
        auth: { user, pass },
    });
};

const transporter = createTransporter();
const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@commandgateway.com';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

// Email template wrapper
const emailWrapper = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 0;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 40px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Command Gateway</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            ${content}
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 20px 40px; text-align: center; border-top: 1px solid #e9ecef;">
                            <p style="margin: 0; color: #6c757d; font-size: 12px;">This is an automated notification from Command Gateway</p>
                            <p style="margin: 5px 0 0; color: #adb5bd; font-size: 11px;">Please do not reply to this email</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

// Button styles
const primaryButton = (text: string, url: string) => `
    <a href="${url}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">${text}</a>
`;

const successButton = (text: string, url: string) => `
    <a href="${url}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 15px rgba(17, 153, 142, 0.4);">${text}</a>
`;

const dangerButton = (text: string, url: string) => `
    <a href="${url}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 15px rgba(235, 51, 73, 0.4);">${text}</a>
`;

const warningButton = (text: string, url: string) => `
    <a href="${url}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 15px rgba(240, 147, 251, 0.4);">${text}</a>
`;

// Info box
const infoBox = (items: { label: string; value: string }[]) => `
    <div style="background: linear-gradient(135deg, #f5f7fa 0%, #e4e8eb 100%); padding: 20px 25px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #667eea;">
        ${items.map(item => `
            <p style="margin: 8px 0; color: #495057;">
                <strong style="color: #343a40;">${item.label}:</strong> 
                <span style="color: #6c757d;">${item.value}</span>
            </p>
        `).join('')}
    </div>
`;

// Status badge
const statusBadge = (status: string, color: string) => `
    <span style="display: inline-block; padding: 6px 16px; background-color: ${color}; color: #ffffff; border-radius: 20px; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">${status}</span>
`;

// Check if email is enabled
export const isEmailEnabled = () => transporter !== null;

// Send email with error handling
const sendEmail = async (to: string, subject: string, html: string) => {
    if (!transporter) {
        return { success: false, reason: 'SMTP not configured' };
    }

    try {
        await transporter.sendMail({
            from: fromAddress,
            to,
            subject,
            html,
        });
        console.log(`Email sent to ${to}: ${subject}`);
        return { success: true };
    } catch (error) {
        console.error('Failed to send email:', error);
        return { success: false, reason: (error as Error).message };
    }
};

// Get all admin emails
const getAdminEmails = async (): Promise<string[]> => {
    const admins = await prisma.user.findMany({
        where: { role: 'admin', email: { not: null } },
        select: { email: true },
    });
    return admins.map(a => a.email).filter((e): e is string => e !== null);
};

// Notify admins about command pending approval
export const notifyAdminsPendingApproval = async (
    commandId: string,
    commandText: string,
    userName: string,
    requiredApprovals: number
) => {
    const adminEmails = await getAdminEmails();
    if (adminEmails.length === 0) return;

    const approvalUrl = `${frontendUrl}/approvals`;
    const subject = 'Action Required: Command Pending Approval';

    const content = `
        <h2 style="margin: 0 0 20px; color: #343a40; font-size: 22px;">New Command Awaiting Approval</h2>
        <p style="margin: 0 0 20px; color: #6c757d; font-size: 15px; line-height: 1.6;">
            A new command has been submitted and requires your review before execution.
        </p>
        
        ${infoBox([
        { label: 'Command ID', value: `<code style="background: #e9ecef; padding: 2px 8px; border-radius: 4px; font-family: monospace;">${commandId}</code>` },
        { label: 'Submitted By', value: userName },
        { label: 'Command', value: `<code style="background: #fff3cd; padding: 4px 10px; border-radius: 4px; font-family: monospace; color: #856404;">${commandText}</code>` },
        { label: 'Required Approvals', value: `${requiredApprovals}` }
    ])}
        
        <div style="text-align: center; margin: 30px 0;">
            ${warningButton('Review & Approve', approvalUrl)}
        </div>
        
        <p style="margin: 20px 0 0; color: #adb5bd; font-size: 13px; text-align: center;">
            Please review this command carefully before approving.
        </p>
    `;

    const html = emailWrapper(content);

    for (const email of adminEmails) {
        await sendEmail(email, subject, html);
    }
};

// Notify user about command approval result
export const notifyUserCommandResult = async (
    userEmail: string | null,
    commandId: string,
    commandText: string,
    decision: 'approved' | 'rejected',
    approverName: string
) => {
    if (!userEmail) return;

    const isApproved = decision === 'approved';
    const dashboardUrl = `${frontendUrl}/dashboard`;
    const subject = `Command ${isApproved ? 'Approved' : 'Rejected'}`;

    const content = `
        <div style="text-align: center; margin-bottom: 25px;">
            ${isApproved
            ? statusBadge('Approved', '#28a745')
            : statusBadge('Rejected', '#dc3545')
        }
        </div>
        
        <h2 style="margin: 0 0 20px; color: #343a40; font-size: 22px; text-align: center;">
            Your Command Has Been ${isApproved ? 'Approved' : 'Rejected'}
        </h2>
        
        <p style="margin: 0 0 20px; color: #6c757d; font-size: 15px; line-height: 1.6; text-align: center;">
            ${isApproved
            ? 'Great news! Your command has been approved and is ready for execution.'
            : 'Your command was reviewed and has been rejected by an administrator.'
        }
        </p>
        
        ${infoBox([
            { label: 'Command ID', value: `<code style="background: #e9ecef; padding: 2px 8px; border-radius: 4px; font-family: monospace;">${commandId}</code>` },
            { label: 'Command', value: `<code style="background: ${isApproved ? '#d4edda' : '#f8d7da'}; padding: 4px 10px; border-radius: 4px; font-family: monospace; color: ${isApproved ? '#155724' : '#721c24'};">${commandText}</code>` },
            { label: 'Reviewed By', value: approverName }
        ])}
        
        <div style="text-align: center; margin: 30px 0;">
            ${isApproved
            ? successButton('View Dashboard', dashboardUrl)
            : primaryButton('View Dashboard', dashboardUrl)
        }
        </div>
        
        ${!isApproved ? `
            <p style="margin: 20px 0 0; color: #6c757d; font-size: 13px; text-align: center;">
                If you believe this was an error, please contact an administrator.
            </p>
        ` : ''}
    `;

    const html = emailWrapper(content);
    await sendEmail(userEmail, subject, html);
};

// Send welcome email to new user
export const sendWelcomeEmail = async (
    email: string,
    name: string,
    apiKey: string,
    role: string
) => {
    const dashboardUrl = `${frontendUrl}/dashboard`;
    const subject = 'Welcome to Command Gateway';

    const content = `
        <div style="text-align: center; margin-bottom: 25px;">
            <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 36px; color: #ffffff;">&#128075;</span>
            </div>
        </div>
        
        <h2 style="margin: 0 0 20px; color: #343a40; font-size: 22px; text-align: center;">
            Welcome to Command Gateway, ${name}!
        </h2>
        
        <p style="margin: 0 0 20px; color: #6c757d; font-size: 15px; line-height: 1.6; text-align: center;">
            Your account has been created successfully. Here are your credentials:
        </p>
        
        ${infoBox([
        { label: 'Name', value: name },
        { label: 'Role', value: `${statusBadge(role, role === 'admin' ? '#667eea' : '#17a2b8')}` }
    ])}
        
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 20px; border-radius: 10px; margin: 25px 0;">
            <p style="margin: 0 0 10px; color: #adb5bd; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Your API Key</p>
            <code style="display: block; background: #0f0f1a; padding: 15px; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 13px; color: #38ef7d; word-break: break-all; border: 1px solid #2d2d44;">${apiKey}</code>
        </div>
        
        <div style="background: linear-gradient(135deg, #fff3cd 0%, #ffeeba 100%); padding: 15px 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="margin: 0; color: #856404; font-size: 14px; font-weight: 600;">
                &#9888; Important: Save your API key now. It will not be shown again!
            </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
            ${successButton('Go to Dashboard', dashboardUrl)}
        </div>
        
        <p style="margin: 20px 0 0; color: #6c757d; font-size: 13px; text-align: center;">
            Use this API key in the <code style="background: #e9ecef; padding: 2px 6px; border-radius: 4px;">X-API-Key</code> header for all API requests.
        </p>
    `;

    const html = emailWrapper(content);
    await sendEmail(email, subject, html);
};

// Notify user about command execution
export const notifyUserCommandExecuted = async (
    userEmail: string | null,
    commandId: string,
    commandText: string,
    creditsUsed: number,
    newBalance: number
) => {
    if (!userEmail) return;

    const historyUrl = `${frontendUrl}/commands`;
    const subject = 'Command Executed Successfully';

    const content = `
        <div style="text-align: center; margin-bottom: 25px;">
            ${statusBadge('Executed', '#28a745')}
        </div>
        
        <h2 style="margin: 0 0 20px; color: #343a40; font-size: 22px; text-align: center;">
            Command Executed Successfully
        </h2>
        
        <p style="margin: 0 0 20px; color: #6c757d; font-size: 15px; line-height: 1.6; text-align: center;">
            Your command has been processed and executed.
        </p>
        
        ${infoBox([
        { label: 'Command ID', value: `<code style="background: #e9ecef; padding: 2px 8px; border-radius: 4px; font-family: monospace;">${commandId}</code>` },
        { label: 'Command', value: `<code style="background: #d4edda; padding: 4px 10px; border-radius: 4px; font-family: monospace; color: #155724;">${commandText}</code>` },
        { label: 'Credits Used', value: `${creditsUsed}` },
        { label: 'New Balance', value: `<strong style="color: #28a745;">${newBalance} credits</strong>` }
    ])}
        
        <div style="text-align: center; margin: 30px 0;">
            ${primaryButton('View Command History', historyUrl)}
        </div>
    `;

    const html = emailWrapper(content);
    await sendEmail(userEmail, subject, html);
};
