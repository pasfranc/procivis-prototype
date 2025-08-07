class StatusController {
    constructor(accountService, emailService, procivisService) {
        this.accountService = accountService;
        this.emailService = emailService;
        this.procivisService = procivisService;
        this.port = process.env.PORT || 3000;
    }

    // GET / - Root endpoint
    getRoot(req, res) {
        res.json({
            message: 'Banking Account Management API',
            version: '1.0.0',
            endpoints: {
                'GET /': 'This message',
                'GET /api/status': 'Server status',
                'GET /api/accounts': 'Get all accounts',
                'POST /api/accounts': 'Register a new account',
                'POST /api/payments': 'Process a payment'
            },
            webInterface: {
                'Banking UI': `http://localhost:${this.port}/bank`
            }
        });
    }

    // GET /api/status - Server status
    getStatus(req, res) {
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            port: this.port,
            database: {
                accountsCount: this.accountService.getAccountCount(),
                dataFile: this.accountService.dataFilePath
            },
            email: this.emailService.getStatus(),
            procivis: this.procivisService.getStatus(),
            webInterface: {
                bankingUI: `http://localhost:${this.port}/bank`
            }
        });
    }
}

module.exports = StatusController;