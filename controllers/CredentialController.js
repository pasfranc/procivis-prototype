class CredentialController {
    constructor(accountService, procivisService) {
        this.accountService = accountService;
        this.procivisService = procivisService;
    }

    // POST /api/credentials/issue - Issue a verifiable credential for an account
    async issueCredential(req, res) {
        try {
            console.log('🔐 Issue credential request received:', req.body);

            const { accountId } = req.body;

            // Basic validation
            if (!accountId) {
                console.log('❌ Missing accountId in request');
                return res.status(400).json({
                    success: false,
                    error: 'accountId is required'
                });
            }

            console.log('🔍 Processing credential for accountId:', accountId);

            // Check if Procivis service is configured
            if (!this.procivisService.isConfigured()) {
                console.log('⚠️ Procivis service not configured');
                return res.status(503).json({
                    success: false,
                    error: 'Procivis service is not configured. Please check PROCIVIS_CLIENT_SECRET'
                });
            }

            console.log('✅ Procivis service is configured');

            // Get account data
            const account = this.accountService.getAccountById(accountId);
            if (!account) {
                console.log('❌ Account not found for ID:', accountId);
                return res.status(404).json({
                    success: false,
                    error: 'Account not found'
                });
            }

            console.log('✅ Account found:', account.cardholderName);
            console.log('🚀 Issuing credential for account:', account.cardholderName, `(${account.email})`);

            // If credential already exists, it will be replaced
            if (account.credentialId) {
                console.log('🔄 Replacing existing credential:', account.credentialId);
            }

            console.log('🔗 Calling Procivis to create credential...');

            // Create credential via Procivis
            const credentialResult = await this.procivisService.createCardCredential({
                id: account.id,
                cardholderName: account.cardholderName,
                pan: account.pan,
                expiryDate: account.expiryDate,
                encryptedECD: account.encryptedECD // Pass encrypted ECD
            });

            console.log('✅ Credential created successfully:', credentialResult.credentialId);

            // Update account with new credential ID (replaces old one if exists)
            const updatedAccount = await this.accountService.updateAccountCredential(
                accountId,
                credentialResult.credentialId
            );

            console.log('✅ Account updated with credential ID');

            // Now share the credential to get QR code URLs
            console.log('📱 Sharing credential to generate QR code...');
            const shareResult = await this.procivisService.shareCredential(credentialResult.credentialId);

            console.log('✅ Credential shared successfully');

            res.status(201).json({
                success: true,
                message: 'Credential issued and shared successfully',
                data: {
                    credentialId: credentialResult.credentialId,
                    qrCode: {
                        url: shareResult.qrCodeUrl,
                        appUrl: shareResult.appUrl
                    },
                    account: {
                        id: updatedAccount.id,
                        cardholderName: updatedAccount.cardholderName,
                        email: updatedAccount.email,
                        credentialCreatedAt: updatedAccount.credentialCreatedAt
                    }
                }
            });

            console.log('🎉 Credential issuance completed successfully');

        } catch (error) {
            console.error('❌ Error issuing credential:', error.message);
            console.error('📍 Stack trace:', error.stack);

            // Determine appropriate status code
            let statusCode = 500;
            if (error.message.includes('not found')) {
                statusCode = 404;
            } else if (error.message.includes('Authentication') || error.message.includes('token')) {
                statusCode = 401;
            } else if (error.message.includes('configured')) {
                statusCode = 503;
            }

            res.status(statusCode).json({
                success: false,
                error: error.message
            });
        }
    }

    // GET /api/credentials/:accountId/status - Get credential status for an account
    async getCredentialStatus(req, res) {
        try {
            const { accountId } = req.params;

            console.log('📊 Getting credential status for accountId:', accountId);

            // Get account data
            const account = this.accountService.getAccountById(accountId);
            if (!account) {
                console.log('❌ Account not found for credential status check:', accountId);
                return res.status(404).json({
                    success: false,
                    error: 'Account not found'
                });
            }

            console.log('✅ Account found, credential status:', account.credentialId ? 'Has credential' : 'No credential');

            res.json({
                success: true,
                data: {
                    accountId: account.id,
                    hasCredential: !!account.credentialId,
                    credentialId: account.credentialId || null,
                    credentialCreatedAt: account.credentialCreatedAt || null,
                    cardholderName: account.cardholderName
                }
            });

        } catch (error) {
            console.error('❌ Error getting credential status:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = CredentialController;