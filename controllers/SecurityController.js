class SecurityController {
    constructor(accountService, procivisService, paymentService, emailService) {
        this.accountService = accountService;
        this.procivisService = procivisService;
        this.paymentService = paymentService;
        this.emailService = emailService;
    }

    // POST /api/security/suspend-credential - Suspend credential from email
    async suspendCredential(req, res) {
        try {
            const { credentialId, accountId } = req.body;

            console.log(`🔒 SECURITY: Manual credential suspension requested - Credential: ${credentialId}, Account: ${accountId}`);

            if (!credentialId) {
                return res.status(400).json({
                    success: false,
                    error: 'Credential ID is required'
                });
            }

            // Get account info
            const account = this.accountService.getAccountById(accountId);
            if (!account) {
                return res.status(404).json({
                    success: false,
                    error: 'Account not found'
                });
            }

            // Suspend credential for 30 days
            const suspendEndDate = new Date();
            suspendEndDate.setDate(suspendEndDate.getDate() + 30);

            await this.procivisService.suspendCredential(credentialId, suspendEndDate.toISOString());

            console.log(`Credential ${credentialId} suspended until ${suspendEndDate.toISOString()}`);

            // Send confirmation email
            if (this.emailService.isConfigured()) {
                await this.emailService.sendCredentialSuspendedConfirmation(
                    account,
                    suspendEndDate
                );
            }

            res.json({
                success: true,
                message: 'Credential suspended successfully',
                data: {
                    credentialId: credentialId,
                    accountId: accountId,
                    suspendedUntil: suspendEndDate.toISOString()
                }
            });

        } catch (error) {
            console.error('Error suspending credential:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // GET /bank/suspend-credential - Redirect to static suspension page
    async renderSuspensionPage(req, res) {
        try {
            const { credentialId, accountId } = req.query;

            if (!credentialId || !accountId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid suspension link - missing credentialId or accountId'
                });
            }

            // Redirect to static HTML page with parameters
            const redirectUrl = `/bank/suspend-credential.html?credentialId=${encodeURIComponent(credentialId)}&accountId=${encodeURIComponent(accountId)}`;
            res.redirect(redirectUrl);

        } catch (error) {
            console.error('Error rendering suspension page:', error.message);
            res.status(500).json({
                success: false,
                error: 'Failed to load suspension page'
            });
        }
    }
}

module.exports = SecurityController;