const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

class EmailService {
    constructor() {
        this.transporter = null;
        this.templatesPath = path.join(process.cwd(), 'templates');
        this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    }

    async initialize() {
        console.log('📧 Initializing email system...');

        // Check required environment variables
        const requiredEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

        if (missingVars.length > 0) {
            console.warn('⚠️ Missing SMTP environment variables:', missingVars);
            console.warn('📧 Email functionality will be disabled');
            return null;
        }

        try {
            // Create transporter
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT),
                secure: process.env.SMTP_PORT === '465',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            console.log('✅ Email transporter initialized successfully');
            return this.transporter;

        } catch (error) {
            console.error('❌ Error initializing email transporter:', error.message);
            return null;
        }
    }

    isConfigured() {
        return this.transporter !== null;
    }

    async loadTemplate(templateName, type = 'html') {
        try {
            const extension = type === 'html' ? '.html' : '.txt';
            const templatePath = path.join(this.templatesPath, `${templateName}${extension}`);
            const template = await fs.readFile(templatePath, 'utf8');
            return template;
        } catch (error) {
            console.error(`❌ Error loading template ${templateName}.${type}:`, error.message);
            throw new Error(`Template ${templateName}.${type} not found`);
        }
    }

    replacePlaceholders(template, variables) {
        let result = template;
        Object.keys(variables).forEach(key => {
            const placeholder = new RegExp(`{{${key}}}`, 'g');
            result = result.replace(placeholder, variables[key] || '');
        });
        return result;
    }

    /**
     * Generate suspension URL for security emails
     * @param {string} credentialId - Credential ID
     * @param {string} accountId - Account ID
     * @returns {string} Complete suspension URL
     */
    generateSuspensionUrl(credentialId, accountId) {
        return `${this.baseUrl}/bank/suspend-credential?credentialId=${encodeURIComponent(credentialId)}&accountId=${encodeURIComponent(accountId)}`;
    }

    async sendPINEmail(email, pin, cardholderName) {
        if (!this.isConfigured()) {
            throw new Error('Email service is not configured. Please check SMTP settings.');
        }

        try {
            console.log('📧 Sending PIN email to:', email);
            console.log('📧 Sending PIN email to:', pin);

            // Verify SMTP connection
            await this.transporter.verify();

            // Load templates
            const htmlTemplate = await this.loadTemplate('pin-notification', 'html');
            const textTemplate = await this.loadTemplate('pin-notification', 'txt');

            // Process templates with variables
            const variables = {
                cardholderName: cardholderName,
                pin: pin
            };

            const htmlContent = this.replacePlaceholders(htmlTemplate, variables);
            const textContent = this.replacePlaceholders(textTemplate, variables);

            // Prepare email
            const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;
            const fromName = process.env.FROM_NAME || 'Banking API System';

            const mailOptions = {
                from: `"${fromName}" <${fromEmail}>`,
                to: email,
                subject: 'Your Banking Account PIN - Keep it Secure!',
                html: htmlContent,
                text: textContent
            };

            // Send email
            const info = await this.transporter.sendMail(mailOptions);
            console.log('✅ PIN email sent successfully to:', email, 'MessageID:', info.messageId);

            return {
                success: true,
                messageId: info.messageId
            };

        } catch (error) {
            console.error('❌ Error sending PIN email:', error.message);
            throw new Error(`Failed to send PIN email: ${error.message}`);
        }
    }

    /**
     * Send security alert email for payment failures - ENHANCED VERSION
     * @param {Object} account - Account object with email, cardholderName, credentialId, id
     * @param {Object} paymentRequest - Payment request details
     * @param {number} consecutiveFailures - Number of consecutive failures
     * @returns {Promise<Object>} Send result
     */
    async sendSecurityAlertForPayment(account, paymentRequest, consecutiveFailures) {
        if (!this.isConfigured()) {
            console.warn('⚠️ Email service not configured, skipping security alert email');
            return { success: false, reason: 'Email service not configured' };
        }

        try {
            console.log('🚨 Sending security alert email to:', account.email, `(${consecutiveFailures} failures)`);

            // Generate suspension URL internally
            const suspendUrl = this.generateSuspensionUrl(account.credentialId, account.id);

            // Load templates
            const htmlTemplate = await this.loadTemplate('security-alert', 'html');
            const textTemplate = await this.loadTemplate('security-alert', 'txt');

            // Process templates with variables
            const variables = {
                cardholderName: account.cardholderName,
                paymentAmount: paymentRequest.amount.toFixed(2),
                merchantId: paymentRequest.merchantId,
                timestamp: new Date().toLocaleString(),
                consecutiveFailures: consecutiveFailures,
                suspendUrl: suspendUrl
            };

            const htmlContent = this.replacePlaceholders(htmlTemplate, variables);
            const textContent = this.replacePlaceholders(textTemplate, variables);

            const result = await this.sendEmail(
                account.email,
                '🚨 Security Alert - Payment Authentication Failed',
                htmlContent,
                textContent
            );

            console.log('✅ Security alert email sent successfully to:', account.email);
            return result;

        } catch (error) {
            console.error('❌ Failed to send security alert email:', error.message);
            // Don't throw - email failure shouldn't break payment flow
            return { success: false, error: error.message };
        }
    }

    /**
     * Send credential revoked email - ENHANCED VERSION
     * @param {Object} account - Account object with email and cardholderName
     * @returns {Promise<Object>} Send result
     */
    async sendCredentialRevokedNotification(account) {
        if (!this.isConfigured()) {
            console.warn('⚠️ Email service not configured, skipping credential revoked email');
            return { success: false, reason: 'Email service not configured' };
        }

        try {
            console.log('📧 Sending credential revoked email to:', account.email);

            // Load templates
            const htmlTemplate = await this.loadTemplate('credential-revoked', 'html');
            const textTemplate = await this.loadTemplate('credential-revoked', 'txt');

            // Process templates with variables
            const variables = {
                cardholderName: account.cardholderName
            };

            const htmlContent = this.replacePlaceholders(htmlTemplate, variables);
            const textContent = this.replacePlaceholders(textTemplate, variables);

            const result = await this.sendEmail(
                account.email,
                '🚨 Credential Revoked for Security',
                htmlContent,
                textContent
            );

            console.log('✅ Credential revoked email sent to:', account.email);
            return result;

        } catch (error) {
            console.error('❌ Failed to send credential revoked email:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send credential suspended confirmation email - ENHANCED VERSION
     * @param {Object} account - Account object with email and cardholderName
     * @param {Date} suspendEndDate - Suspension end date
     * @returns {Promise<Object>} Send result
     */
    async sendCredentialSuspendedConfirmation(account, suspendEndDate) {
        if (!this.isConfigured()) {
            console.warn('⚠️ Email service not configured, skipping credential suspended email');
            return { success: false, reason: 'Email service not configured' };
        }

        try {
            console.log('📧 Sending credential suspended confirmation to:', account.email);

            // Load templates
            const htmlTemplate = await this.loadTemplate('credential-suspended', 'html');
            const textTemplate = await this.loadTemplate('credential-suspended', 'txt');

            // Process templates with variables
            const variables = {
                cardholderName: account.cardholderName,
                suspendedUntil: suspendEndDate.toLocaleDateString()
            };

            const htmlContent = this.replacePlaceholders(htmlTemplate, variables);
            const textContent = this.replacePlaceholders(textTemplate, variables);

            const result = await this.sendEmail(
                account.email,
                '🔒 Credential Suspended Successfully',
                htmlContent,
                textContent
            );

            console.log('✅ Credential suspended confirmation sent to:', account.email);
            return result;

        } catch (error) {
            console.error('❌ Failed to send credential suspended email:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send generic email with HTML content
     * @param {string} email - Recipient email
     * @param {string} subject - Email subject
     * @param {string} htmlContent - HTML content
     * @param {string} textContent - Plain text content (optional)
     * @returns {Promise<Object>} Send result
     */
    async sendEmail(email, subject, htmlContent, textContent = null) {
        if (!this.isConfigured()) {
            throw new Error('Email service is not configured. Please check SMTP settings.');
        }

        try {
            // Verify SMTP connection
            await this.transporter.verify();

            // Prepare email
            const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;
            const fromName = process.env.FROM_NAME || 'Banking API System';

            const mailOptions = {
                from: `"${fromName}" <${fromEmail}>`,
                to: email,
                subject: subject,
                html: htmlContent,
                text: textContent || htmlContent.replace(/<[^>]*>/g, '') // Strip HTML tags for text version
            };

            // Send email
            const info = await this.transporter.sendMail(mailOptions);
            console.log('✅ Email sent successfully to:', email, 'Subject:', subject, 'MessageID:', info.messageId);

            return {
                success: true,
                messageId: info.messageId
            };

        } catch (error) {
            console.error('❌ Error sending email:', error.message);
            throw new Error(`Failed to send email: ${error.message}`);
        }
    }

    // ==================
    // LEGACY METHODS (for backward compatibility)
    // ==================

    /**
     * @deprecated Use sendSecurityAlertForPayment instead
     */
    async sendSecurityAlertEmail(email, cardholderName, consecutiveFailures, paymentRequest, suspendUrl) {
        console.warn('⚠️ sendSecurityAlertEmail is deprecated, use sendSecurityAlertForPayment instead');

        const account = { email, cardholderName };
        return await this.sendSecurityAlertForPayment(account, paymentRequest, consecutiveFailures);
    }

    /**
     * @deprecated Use sendCredentialRevokedNotification instead
     */
    async sendCredentialRevokedEmail(email, cardholderName) {
        console.warn('⚠️ sendCredentialRevokedEmail is deprecated, use sendCredentialRevokedNotification instead');

        const account = { email, cardholderName };
        return await this.sendCredentialRevokedNotification(account);
    }

    /**
     * @deprecated Use sendCredentialSuspendedConfirmation instead
     */
    async sendCredentialSuspendedEmail(email, cardholderName, suspendEndDate) {
        console.warn('⚠️ sendCredentialSuspendedEmail is deprecated, use sendCredentialSuspendedConfirmation instead');

        const account = { email, cardholderName };
        return await this.sendCredentialSuspendedConfirmation(account, suspendEndDate);
    }

    getStatus() {
        return {
            configured: this.isConfigured(),
            smtpHost: process.env.SMTP_HOST || 'Not configured',
            smtpPort: process.env.SMTP_PORT || 'Not configured',
            baseUrl: this.baseUrl
        };
    }
}

module.exports = EmailService;