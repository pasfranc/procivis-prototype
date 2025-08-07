const express = require('express');
const dotenv = require('dotenv');

// Import configuration modules
const { initializeServices } = require('./config/serviceInit');
const { setupMiddleware } = require('./config/middleware');
const { setupErrorHandling } = require('./config/errorHandling');
const { setupRoutes } = require('./routes');
const { setupPeriodicTasks } = require('./config/periodicTasks');

// Load environment variables
dotenv.config();

// Create Express application instance
const app = express();
const PORT = process.env.PORT || 3000;

// Start server
async function startServer() {
    try {
        console.log('🚀 Starting Enhanced Banking API Server...');
        console.log('===============================================');

        // Initialize all services
        const services = await initializeServices();

        // Setup middleware
        setupMiddleware(app);

        // Setup all routes with services
        setupRoutes(app, services);

        // Setup error handling (always last for middleware)
        setupErrorHandling(app);

        // Setup periodic tasks
        setupPeriodicTasks(services.paymentService);

        // Start listening
        app.listen(PORT, () => {
            console.log('===============================================');
            console.log('🎉 Enhanced Banking API Server Started!');
            console.log('===============================================');
            console.log(`🚀 Server running on port: ${PORT}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🔗 API available at: http://localhost:${PORT}`);
            console.log(`🌐 Banking web interface: http://localhost:${PORT}/bank`);
            console.log(`💳 Merchant web interface: http://localhost:${PORT}/merchant`);
            console.log(`❤️  Health check: http://localhost:${PORT}/health`);
            console.log('');
            console.log('📧 Services Status:');
            console.log(`   Email service: ${services.emailService.isConfigured() ? '✅ Configured' : '❌ Not configured'}`);
            console.log(`   Procivis service: ${services.procivisService.isConfigured() ? '✅ Configured' : '❌ Not configured'}`);
            console.log(`   Payment service: ✅ Initialized with security features`);
            console.log(`   Account service: ✅ Initialized`);
            console.log('');
            console.log('🔐 Security Features:');
            console.log('   ✅ PIN failure tracking');
            console.log('   ✅ Automatic security emails');
            console.log('   ✅ Credential suspension (manual)');
            console.log('   ✅ Credential revocation (automatic after 5 failures)');
            console.log('   ✅ Payment attempt logging (all statuses)');
            console.log('===============================================');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
    process.exit(1);
});

// Start the server
startServer();