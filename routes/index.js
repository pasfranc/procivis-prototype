const express = require('express');

function setupRoutes(app, services) {
    console.log('Setting up all routes...');

    const {
        accountController,
        statusController,
        paymentController,
        credentialController,
        securityController
    } = services;

    // Health check endpoint
    app.get('/health', (req, res) => {
        const healthStatus = {
            status: 'OK',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            services: {
                accountService: !!services.accountService,
                emailService: {
                    initialized: !!services.emailService,
                    configured: services.emailService.isConfigured()
                },
                procivisService: {
                    initialized: !!services.procivisService,
                    configured: services.procivisService.isConfigured()
                },
                paymentService: !!services.paymentService
            },
            environment: process.env.NODE_ENV || 'development',
            nodeVersion: process.version
        };

        res.json(healthStatus);
    });

    // Root endpoint
    app.get('/', (req, res) => statusController.getRoot(req, res));

    // API routes
    app.get('/api/status', (req, res) => statusController.getStatus(req, res));

    // Account routes
    app.get('/api/accounts', (req, res) => accountController.getAllAccounts(req, res));
    app.post('/api/accounts', (req, res) => accountController.createAccount(req, res));

    // Payment routes
    app.post('/api/payments/request', (req, res) => paymentController.createPaymentRequest(req, res));
    app.get('/api/payments/:paymentId/status', (req, res) => paymentController.getPaymentStatus(req, res));
    app.post('/api/payments/:paymentId/process', (req, res) => paymentController.processPayment(req, res));
    app.post('/api/payments/:paymentId/verify-pin', (req, res) => paymentController.verifyPINAndCompletePayment(req, res));
    app.get('/api/payments/all', (req, res) => paymentController.getAllPayments(req, res));
    app.post('/api/payments/cleanup', (req, res) => paymentController.cleanupExpiredPayments(req, res));

    // Credential routes  
    app.post('/api/credentials/issue', (req, res) => credentialController.issueCredential(req, res));
    app.get('/api/credentials/:accountId/status', (req, res) => credentialController.getCredentialStatus(req, res));

    // Security routes
    app.post('/api/security/suspend-credential', (req, res) => securityController.suspendCredential(req, res));
    app.get('/bank/suspend-credential', (req, res) => securityController.renderSuspensionPage(req, res));

    console.log('✅ All routes setup complete');
}

module.exports = {
    setupRoutes
};