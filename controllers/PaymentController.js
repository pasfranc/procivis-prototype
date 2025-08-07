const SecurityConfig = require('../services/SecurityConfig');

class PaymentController {
    constructor(accountService, procivisService, paymentService, emailService) {
        this.accountService = accountService;
        this.procivisService = procivisService;
        this.paymentService = paymentService;
        this.emailService = emailService;
        this.securityConfig = new SecurityConfig();
    }

    // POST /api/payments/request - Create payment request with proof request
    async createPaymentRequest(req, res) {
        try {
            console.log('💳 Creating payment request:', req.body);

            const { amount, description = '', merchantId = 'default-merchant' } = req.body;

            // Validate amount
            const numericAmount = parseFloat(amount);
            if (isNaN(numericAmount) || numericAmount <= 0) {
                console.log('❌ Invalid payment amount:', amount);
                return res.status(400).json({
                    success: false,
                    error: 'Valid payment amount is required'
                });
            }

            console.log('🚀 Creating payment request for €', numericAmount);

            // Create payment request in PaymentService first
            const paymentRequest = await this.paymentService.createPaymentRequest({
                amount: numericAmount,
                description: description,
                merchantId: merchantId
            });

            console.log('✅ Payment request created in PaymentService:', paymentRequest.id);

            // Check if Procivis service is configured
            if (!this.procivisService.isConfigured()) {
                console.warn('⚠️ Procivis service not configured, returning basic payment request');
                return res.status(201).json({
                    success: true,
                    message: 'Payment request created successfully (Procivis not configured)',
                    data: paymentRequest
                });
            }

            try {
                // Create proof request via Procivis
                console.log('🔗 Creating proof request via Procivis...');
                const proofResult = await this.procivisService.createProofRequest();

                console.log('✅ Proof request created:', proofResult.proofRequestId);

                // Share proof request to get QR code
                console.log('📱 Sharing proof request to get QR code...');
                const shareResult = await this.procivisService.shareProofRequest(proofResult.proofRequestId);

                console.log('✅ Proof request shared successfully');

                // Update payment request with Procivis data
                const updatedPaymentRequest = await this.paymentService.updatePaymentRequestStatus(
                    paymentRequest.id,
                    'pending',
                    {
                        proofRequestId: proofResult.proofRequestId,
                        qrCode: {
                            url: shareResult.qrCodeUrl,
                            appUrl: shareResult.appUrl
                        }
                    }
                );

                res.status(201).json({
                    success: true,
                    message: 'Payment request created successfully',
                    data: updatedPaymentRequest
                });

            } catch (procivisError) {
                console.error('❌ Procivis integration failed:', procivisError.message);

                // Return the basic payment request even if Procivis fails
                res.status(201).json({
                    success: true,
                    message: 'Payment request created (Procivis integration failed)',
                    data: paymentRequest,
                    warning: 'Advanced verification features unavailable'
                });
            }

            console.log('🎉 Payment request creation completed');

        } catch (error) {
            console.error('❌ Error creating payment request:', error.message);

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // GET /api/payments/:paymentId/status - Check payment status
    async getPaymentStatus(req, res) {
        try {
            const { paymentId } = req.params;
            console.log('📊 Checking payment status for:', paymentId);

            // Get payment request from PaymentService
            const paymentRequest = this.paymentService.getPaymentRequestById(paymentId);

            if (!paymentRequest) {
                console.log('❌ Payment request not found:', paymentId);
                return res.status(404).json({
                    success: false,
                    error: 'Payment request not found'
                });
            }

            // Check if payment request has expired
            const now = new Date().toISOString();
            if (paymentRequest.status === 'pending' && paymentRequest.expiresAt <= now) {
                console.log('⏰ Payment request expired:', paymentId);

                await this.paymentService.updatePaymentRequestStatus(paymentId, 'expired');

                // Record expired payment attempt
                await this.paymentService.recordPaymentAttempt({
                    paymentRequestId: paymentId,
                    status: 'failed_expired',
                    amount: paymentRequest.amount,
                    merchantId: paymentRequest.merchantId,
                    description: paymentRequest.description,
                    errorReason: 'Payment request expired',
                    errorDetails: `Request expired at ${paymentRequest.expiresAt}`
                });

                paymentRequest.status = 'expired';
            }

            // If we have a proof request ID, check Procivis status
            let proofStatus = null;
            if (paymentRequest.proofRequestId && this.procivisService.isConfigured()) {
                try {
                    proofStatus = await this.procivisService.getProofRequestStatus(paymentRequest.proofRequestId);

                    // Update payment status based on proof status
                    if (proofStatus.state === 'ACCEPTED' && paymentRequest.status === 'pending') {
                        await this.paymentService.updatePaymentRequestStatus(paymentId, 'processing', {
                            proofState: proofStatus.state,
                            proofAcceptedAt: new Date().toISOString()
                        });
                        paymentRequest.status = 'processing';
                    }
                } catch (procivisError) {
                    console.error('❌ Error checking Procivis status:', procivisError.message);
                }
            }

            console.log('✅ Payment status for', paymentId, ':', paymentRequest.status);

            res.json({
                success: true,
                data: {
                    id: paymentRequest.id,
                    status: paymentRequest.status,
                    amount: paymentRequest.amount,
                    description: paymentRequest.description,
                    merchantId: paymentRequest.merchantId,
                    createdAt: paymentRequest.createdAt,
                    updatedAt: paymentRequest.updatedAt,
                    expiresAt: paymentRequest.expiresAt,
                    paymentUrl: paymentRequest.paymentUrl,
                    proofRequestId: paymentRequest.proofRequestId || null,
                    proofState: proofStatus?.state || null,
                    qrCode: paymentRequest.qrCode || null
                }
            });

        } catch (error) {
            console.error('❌ Error checking payment status:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // POST /api/payments/:paymentId/process - Process payment after verification
    async processPayment(req, res) {
        try {
            const { paymentId } = req.params;

            console.log('🔄 Processing payment:', paymentId);

            // Get payment request from PaymentService
            const paymentRequest = this.paymentService.getPaymentRequestById(paymentId);

            if (!paymentRequest) {
                console.log('❌ Payment request not found:', paymentId);
                return res.status(404).json({
                    success: false,
                    error: 'Payment request not found'
                });
            }

            // Check if payment request is valid for processing
            if (!['pending', 'processing'].includes(paymentRequest.status)) {
                console.log('❌ Payment request invalid status:', paymentRequest.status);
                return res.status(400).json({
                    success: false,
                    error: `Payment request is ${paymentRequest.status} and cannot be processed`
                });
            }

            // Check if payment request has expired
            const now = new Date().toISOString();
            if (paymentRequest.expiresAt <= now) {
                console.log('⏰ Payment request expired during processing:', paymentId);

                await this.paymentService.updatePaymentRequestStatus(paymentId, 'expired');

                // Record expired payment attempt
                await this.paymentService.recordPaymentAttempt({
                    paymentRequestId: paymentId,
                    status: 'failed_expired',
                    amount: paymentRequest.amount,
                    merchantId: paymentRequest.merchantId,
                    description: paymentRequest.description,
                    errorReason: 'Payment request expired during processing',
                    errorDetails: `Request expired at ${paymentRequest.expiresAt}`
                });

                return res.status(400).json({
                    success: false,
                    error: 'Payment request has expired'
                });
            }

            // If we have Procivis proof request, check if it's accepted
            if (paymentRequest.proofRequestId && this.procivisService.isConfigured()) {
                try {
                    const proofDetails = await this.procivisService.getProofRequestDetails(paymentRequest.proofRequestId);

                    if (proofDetails.state === 'ACCEPTED') {
                        // Update payment request status to processing (waiting for PIN)
                        await this.paymentService.updatePaymentRequestStatus(paymentId, 'processing', {
                            proofState: proofDetails.state,
                            proofAcceptedAt: new Date().toISOString()
                        });

                        console.log('✅ Proof accepted, payment ready for PIN verification');

                        return res.json({
                            success: true,
                            message: 'Proof accepted. Please enter PIN to complete payment.',
                            data: {
                                paymentId: paymentId,
                                status: 'processing',
                                proofState: 'ACCEPTED',
                                message: 'Ready for PIN verification'
                            }
                        });
                    } else {
                        console.log('⚠️ Proof not yet accepted by customer');
                        return res.status(400).json({
                            success: false,
                            error: 'Proof not yet accepted by customer'
                        });
                    }
                } catch (procivisError) {
                    console.error('❌ Error checking Procivis proof:', procivisError.message);
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to verify proof status'
                    });
                }
            } else {
                console.log('⚠️ No proof verification available');
                return res.status(400).json({
                    success: false,
                    error: 'No proof verification available'
                });
            }

        } catch (error) {
            console.error('❌ Error processing payment:', error.message);

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // POST /api/payments/:paymentId/verify-pin - Verify PIN and complete payment
    async verifyPINAndCompletePayment(req, res) {
        try {
            const { paymentId } = req.params;
            const { pin } = req.body;

            console.log('🔐 Verifying PIN for payment:', paymentId);

            if (!paymentId) {
                return res.status(400).json({
                    success: false,
                    error: 'Payment ID is required'
                });
            }

            if (!pin) {
                return res.status(400).json({
                    success: false,
                    error: 'PIN is required'
                });
            }

            // Get payment request
            const paymentRequest = this.paymentService.getPaymentRequestById(paymentId);

            if (!paymentRequest) {
                console.log('❌ Payment request not found:', paymentId);
                return res.status(404).json({
                    success: false,
                    error: 'Payment request not found'
                });
            }

            // Check if payment request is in the right state (should be processing with proof accepted)
            if (paymentRequest.status !== 'processing') {
                console.log('❌ Payment not in processing state:', paymentRequest.status);

                // Record attempt with wrong status
                await this.paymentService.recordPaymentAttempt({
                    paymentRequestId: paymentId,
                    status: 'failed_invalid_state',
                    amount: paymentRequest.amount,
                    merchantId: paymentRequest.merchantId,
                    description: paymentRequest.description,
                    errorReason: 'Payment not in processing state',
                    errorDetails: `Current status: ${paymentRequest.status}, expected: processing`
                });

                return res.status(400).json({
                    success: false,
                    error: 'Payment request is not ready for PIN verification'
                });
            }

            // Get account info from proof verification
            let account = null;

            if (paymentRequest.proofRequestId && this.procivisService.isConfigured()) {
                try {
                    const proofDetails = await this.procivisService.getProofRequestDetails(paymentRequest.proofRequestId);

                    if (proofDetails.state !== 'ACCEPTED') {
                        console.log('❌ Credential verification not completed');
                        return res.status(400).json({
                            success: false,
                            error: 'Credential verification not completed'
                        });
                    }

                    // Extract account info from proof claims
                    const cardHolderName = proofDetails.proofInputs[0].claims.find(c => c.path === 'cardHolderName')?.value;
                    const last4Digits = proofDetails.proofInputs[0].claims.find(c => c.path === 'last4Digits')?.value;

                    if (!cardHolderName || !last4Digits) {
                        console.log('❌ Required credential data not found');
                        return res.status(400).json({
                            success: false,
                            error: 'Required credential data not found'
                        });
                    }

                    // Find account by credential data
                    account = this.findAccountByCredentialData(cardHolderName, last4Digits);
                    if (!account) {
                        console.log('❌ Account not found for provided credentials');

                        // Record invalid credential attempt
                        await this.paymentService.recordPaymentAttempt({
                            paymentRequestId: paymentId,
                            status: 'failed_invalid_credential',
                            amount: paymentRequest.amount,
                            merchantId: paymentRequest.merchantId,
                            description: paymentRequest.description,
                            errorReason: 'Account not found for provided credentials',
                            errorDetails: `Credential: ${cardHolderName} - *${last4Digits}`
                        });

                        return res.status(400).json({
                            success: false,
                            error: 'Account not found for provided credentials'
                        });
                    }
                } catch (error) {
                    console.error('❌ Error getting proof details:', error.message);
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to verify credentials'
                    });
                }
            } else {
                console.log('❌ No credential verification available');
                return res.status(400).json({
                    success: false,
                    error: 'No credential verification available'
                });
            }

            // Verify PIN
            console.log('🔐 Verifying PIN for account:', account.id);

            if (pin !== account.pin) {
                console.log('❌ PIN verification failed for account:', account.id);

                // Record failed PIN attempt
                await this.paymentService.recordPaymentAttempt({
                    paymentRequestId: paymentId,
                    status: 'failed_pin',
                    amount: paymentRequest.amount,
                    merchantId: paymentRequest.merchantId,
                    description: paymentRequest.description,
                    accountId: account.id,
                    cardholderName: account.cardholderName,
                    accountEmail: account.email,
                    errorReason: 'Invalid PIN',
                    errorDetails: 'PIN verification failed',
                    clientIp: req.ip || req.connection.remoteAddress,
                    userAgent: req.get('User-Agent')
                });

                // Check consecutive PIN failures for security
                const consecutiveFailures = this.paymentService.getConsecutivePinFailures(account.id);
                const securityStatus = this.securityConfig.getSecurityStatus(consecutiveFailures);

                console.log('⚠️ Account', account.id, 'now has', consecutiveFailures, 'consecutive PIN failures');
                console.log('🔐 Security status:', securityStatus.emoji, securityStatus.level, '-', securityStatus.message);

                // Send security alert email if threshold reached
                if (this.securityConfig.shouldTriggerAlert(consecutiveFailures)) {
                    console.log('📧 Sending security alert email (threshold:', this.securityConfig.getAlertThreshold(), 'reached)');
                    await this.emailService.sendSecurityAlertForPayment(account, paymentRequest, consecutiveFailures);
                }

                // Check if we need to revoke credential
                if (this.securityConfig.shouldTriggerRevocation(consecutiveFailures)) {
                    console.log('🚨 SECURITY: Account', account.id, 'reached revocation threshold (', this.securityConfig.getRevokeThreshold(), ') - REVOKING CREDENTIAL');

                    try {
                        if (account.credentialId && this.procivisService.isConfigured()) {
                            await this.procivisService.revokeCredential(account.credentialId);
                            console.log('✅ Credential', account.credentialId, 'revoked successfully');

                            // Send revocation email via EmailService
                            await this.emailService.sendCredentialRevokedNotification(account);
                        }
                    } catch (revokeError) {
                        console.error('❌ Failed to revoke credential:', revokeError.message);
                        // Continue with the response even if revocation fails
                    }
                }

                return res.status(400).json({
                    success: false,
                    error: 'Invalid PIN. Please check and try again.'
                });
            }

            console.log('✅ PIN verified successfully, processing payment...');

            // Check sufficient balance
            if (account.balance < paymentRequest.amount) {
                console.log('❌ Insufficient balance for account:', account.id);

                // Record insufficient funds attempt
                await this.paymentService.recordPaymentAttempt({
                    paymentRequestId: paymentId,
                    status: 'failed_insufficient_funds',
                    amount: paymentRequest.amount,
                    merchantId: paymentRequest.merchantId,
                    description: paymentRequest.description,
                    accountId: account.id,
                    cardholderName: account.cardholderName,
                    accountEmail: account.email,
                    errorReason: 'Insufficient balance',
                    errorDetails: `Available: €${account.balance.toFixed(2)}, Required: €${paymentRequest.amount.toFixed(2)}`,
                    previousBalance: account.balance
                });

                await this.paymentService.updatePaymentRequestStatus(paymentId, 'failed', {
                    errorReason: 'Insufficient balance',
                    errorDetails: `Available: €${account.balance.toFixed(2)}, Required: €${paymentRequest.amount.toFixed(2)}`,
                    failedAt: new Date().toISOString()
                });

                return res.status(400).json({
                    success: false,
                    error: `Insufficient balance. Available: €${account.balance.toFixed(2)}, Required: €${paymentRequest.amount.toFixed(2)}`
                });
            }

            // Process payment by updating account balance
            const previousBalance = account.balance;
            const newBalance = previousBalance - paymentRequest.amount;

            await this.accountService.updateAccountBalance(
                account.id,
                newBalance,
                `Payment via PIN verification - Payment ID: ${paymentId}`
            );

            // Record successful payment
            const completedPayment = await this.paymentService.recordPaymentAttempt({
                paymentRequestId: paymentId,
                status: 'completed',
                amount: paymentRequest.amount,
                merchantId: paymentRequest.merchantId,
                description: paymentRequest.description,
                accountId: account.id,
                cardholderName: account.cardholderName,
                accountEmail: account.email,
                transactionId: `txn_${Date.now()}`,
                previousBalance: previousBalance,
                newBalance: newBalance
            });

            // Update payment request status to completed
            await this.paymentService.updatePaymentRequestStatus(paymentId, 'completed', {
                completedAt: new Date().toISOString(),
                transactionId: completedPayment.id,
                accountId: account.id,
                cardholderName: account.cardholderName,
                pinVerifiedAt: new Date().toISOString()
            });

            console.log('🎉 Payment completed:', paymentId, '- €', paymentRequest.amount, 'from', account.cardholderName, 'to', paymentRequest.merchantId);

            // Return success response
            res.json({
                success: true,
                message: 'Payment completed successfully',
                data: {
                    paymentId: paymentId,
                    transactionId: completedPayment.id,
                    amount: paymentRequest.amount,
                    merchantId: paymentRequest.merchantId,
                    description: paymentRequest.description,
                    cardholderName: account.cardholderName,
                    timestamp: completedPayment.timestamp,
                    balance: {
                        previous: previousBalance,
                        current: newBalance
                    }
                }
            });

            console.log('✅ PIN verification and payment completion successful');

        } catch (error) {
            console.error('❌ Error verifying PIN and completing payment:', error.message);

            // Update payment request status to failed
            try {
                await this.paymentService.updatePaymentRequestStatus(paymentId, 'failed', {
                    errorReason: 'PIN verification error',
                    errorDetails: error.message,
                    failedAt: new Date().toISOString()
                });
            } catch (updateError) {
                console.error('❌ Failed to update payment status:', updateError.message);
            }

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // GET /api/payments/all - Get all payments (for prototype)
    async getAllPayments(req, res) {
        try {
            console.log('📊 Getting all payments for prototype view');

            const { onlySuccessful = false } = req.query;

            // Get all payment requests and payment attempts
            const allPaymentRequests = this.paymentService.getAllPaymentRequests();
            const allPaymentAttempts = onlySuccessful === 'true'
                ? this.paymentService.getSuccessfulPayments()
                : this.paymentService.getAllPayments();
            const overallStatistics = this.paymentService.getPaymentStatistics();

            console.log('✅ Found', allPaymentRequests.length, 'payment requests and', allPaymentAttempts.length, 'payment attempts (successful only:', onlySuccessful, ')');

            res.json({
                success: true,
                data: {
                    paymentRequests: allPaymentRequests.slice(-50), // Last 50 requests
                    completedPayments: allPaymentAttempts.slice(-50), // Last 50 attempts (or successful only)
                    statistics: overallStatistics,
                    filters: {
                        onlySuccessful: onlySuccessful === 'true'
                    }
                }
            });

        } catch (error) {
            console.error('❌ Error getting all payments:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // POST /api/payments/cleanup - Cleanup method to expire old payment requests
    async cleanupExpiredPayments(req, res) {
        try {
            console.log('🧹 Starting payments cleanup...');

            const expiredCount = await this.paymentService.expireOldPaymentRequests();
            const cleanedCount = await this.paymentService.cleanupExpiredRequests();

            console.log('✅ Cleanup completed:', expiredCount, 'expired,', cleanedCount, 'cleaned');

            res.json({
                success: true,
                message: 'Payment cleanup completed',
                data: {
                    expiredRequests: expiredCount,
                    cleanedRequests: cleanedCount
                }
            });

        } catch (error) {
            console.error('❌ Error during payment cleanup:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // ===============================
    // HELPER METHODS (PRIVATE)
    // ===============================

    /**
     * Find account by credential data from proof verification
     * @param {string} cardHolderName - Cardholder name from credential
     * @param {string} last4Digits - Last 4 digits from credential
     * @returns {Object|null} Account object or null if not found
     */
    findAccountByCredentialData(cardHolderName, last4Digits) {
        try {
            const accounts = this.accountService.getAllAccounts();
            return accounts.find(account =>
                account.cardholderName === cardHolderName &&
                account.pan.slice(-4) === last4Digits
            );
        } catch (error) {
            console.error('❌ Error finding account by credential data:', error.message);
            return null;
        }
    }
}

module.exports = PaymentController;