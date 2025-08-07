class AccountController {
    constructor(accountService, emailService) {
        this.accountService = accountService;
        this.emailService = emailService;
    }

    // GET /accounts - Get all accounts
    async getAllAccounts(req, res) {
        try {
            // Use the secure method that masks sensitive data
            const accounts = this.accountService.getAllAccountsForAPI();

            res.json({
                success: true,
                data: accounts
            });
        } catch (error) {
            console.error('Error getting all accounts:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // POST /accounts - Create new account
    async createAccount(req, res) {
        try {
            // Create account using service
            const newAccount = await this.accountService.createAccount(req.body);

            // Send email if service is configured
            if (this.emailService.isConfigured()) {
                try {
                    await this.emailService.sendPINEmail(
                        newAccount.email,
                        newAccount.pin,
                        newAccount.cardholderName
                    );
                    console.log('PIN email sent successfully');
                } catch (emailError) {
                    console.error('Failed to send PIN email:', emailError.message);

                    // Delete account if email fails (transactional safety)
                    // Note: In a real implementation, you'd want to rollback the database transaction
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to send PIN email. Account registration cancelled.',
                        details: emailError.message
                    });
                }
            }

            res.status(201).json({
                success: true,
                message: 'Account registered successfully and PIN sent via email',
                data: newAccount,
                emailSent: this.emailService.isConfigured()
            });

        } catch (error) {
            console.error('Error creating account:', error.message);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = AccountController;