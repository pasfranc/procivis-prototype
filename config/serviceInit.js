// Service initialization and dependency injection
const AccountService = require('../services/AccountService');
const EmailService = require('../services/EmailService');
const ProcivisService = require('../services/ProcivisService');
const PaymentService = require('../services/PaymentService');

// Controllers
const AccountController = require('../controllers/AccountController');
const StatusController = require('../controllers/StatusController');
const PaymentController = require('../controllers/PaymentController');
const CredentialController = require('../controllers/CredentialController');
const SecurityController = require('../controllers/SecurityController');

async function initializeServices() {
    console.log('🚀 Initializing all services...');

    try {
        // Initialize services
        const accountService = new AccountService();
        const emailService = new EmailService();
        const procivisService = new ProcivisService();
        const paymentService = new PaymentService();

        // Initialize each service
        await accountService.initialize();
        console.log('✅ AccountService initialized');

        await emailService.initialize();
        console.log('✅ EmailService initialized');

        await procivisService.initialize();
        console.log('✅ ProcivisService initialized');

        await paymentService.initialize();
        console.log('✅ PaymentService initialized');

        // Initialize controllers with dependencies
        const accountController = new AccountController(accountService, emailService);
        const statusController = new StatusController(accountService, emailService, procivisService);
        const paymentController = new PaymentController(accountService, procivisService, paymentService, emailService);
        const credentialController = new CredentialController(accountService, procivisService);
        const securityController = new SecurityController(accountService, procivisService, paymentService, emailService);

        console.log('🎯 All services and controllers initialized successfully!');

        return {
            // Services
            accountService,
            emailService,
            procivisService,
            paymentService,

            // Controllers
            accountController,
            statusController,
            paymentController,
            credentialController,
            securityController
        };

    } catch (error) {
        console.error('❌ Service initialization failed:', error.message);
        throw error;
    }
}

module.exports = {
    initializeServices
};