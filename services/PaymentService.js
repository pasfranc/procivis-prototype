const fs = require('fs').promises;
const path = require('path');

class PaymentService {
    constructor(dataFilePath) {
        this.dataFilePath = dataFilePath || process.env.PAYMENTS_DATA_FILE || path.join(process.cwd(), 'payments.json');
        this.database = new Map();
    }

    async initialize() {
        console.log('Initializing PaymentService...');
        await this.loadDataFromFile();
        console.log('PaymentService initialization complete');
    }

    async loadDataFromFile() {
        try {
            console.log('Loading payments data from file:', this.dataFilePath);

            try {
                await fs.access(this.dataFilePath);
            } catch (error) {
                console.log('Payments data file not found, creating empty payments.json');
                await this.saveDataToFile();
                return;
            }

            const fileContent = await fs.readFile(this.dataFilePath, 'utf8');

            if (!fileContent.trim()) {
                console.log('Payments data file is empty, initializing with empty data');
                this.initializeEmptyDatabase();
                return;
            }

            const jsonData = JSON.parse(fileContent);

            // Load payment requests
            if (jsonData.paymentRequests && Array.isArray(jsonData.paymentRequests)) {
                this.database.set('paymentRequests', jsonData.paymentRequests);
                console.log(`Loaded ${jsonData.paymentRequests.length} payment requests`);
            } else {
                this.database.set('paymentRequests', []);
                console.log('No payment requests found, initialized empty array');
            }

            // Load completed payments (now includes all payment attempts)
            if (jsonData.payments && Array.isArray(jsonData.payments)) {
                this.database.set('payments', jsonData.payments);
                console.log(`Loaded ${jsonData.payments.length} payment attempts`);
            } else {
                this.database.set('payments', []);
                console.log('No payment attempts found, initialized empty array');
            }

        } catch (error) {
            console.error('Error loading payments data from file:', error.message);
            this.initializeEmptyDatabase();
        }
    }

    initializeEmptyDatabase() {
        this.database.set('paymentRequests', []);
        this.database.set('payments', []);
    }

    async saveDataToFile() {
        try {
            const dataToSave = {
                paymentRequests: this.database.get('paymentRequests') || [],
                payments: this.database.get('payments') || [],
                lastUpdated: new Date().toISOString(),
                version: "1.1",
                description: "Payment system data - requests and all payment attempts (successful and failed)"
            };

            await fs.writeFile(this.dataFilePath, JSON.stringify(dataToSave, null, 2), 'utf8');

            // Set restrictive file permissions in production
            if (process.env.NODE_ENV === 'production') {
                try {
                    await fs.chmod(this.dataFilePath, 0o600);
                    console.log('Restrictive file permissions set for payments data file');
                } catch (permError) {
                    console.warn('Could not set restrictive file permissions:', permError.message);
                }
            }

            console.log('Payments data saved to file successfully');

        } catch (error) {
            console.error('Error saving payments data to file:', error.message);
            throw error;
        }
    }

    // UTILITY METHODS
    generatePaymentId() {
        return 'pay_' + Date.now().toString() + Math.random().toString(36).substr(2, 10);
    }

    // PAYMENT REQUEST METHODS
    getAllPaymentRequests() {
        return this.database.get('paymentRequests') || [];
    }

    getPaymentRequestById(paymentId) {
        const paymentRequests = this.getAllPaymentRequests();
        return paymentRequests.find(req => req.id === paymentId) || null;
    }

    getPaymentRequestsByMerchant(merchantId) {
        const paymentRequests = this.getAllPaymentRequests();
        return paymentRequests.filter(req => req.merchantId === merchantId);
    }

    getActivePaymentRequests() {
        const paymentRequests = this.getAllPaymentRequests();
        const now = new Date().toISOString();
        return paymentRequests.filter(req =>
            req.status === 'pending' && req.expiresAt > now
        );
    }

    async createPaymentRequest(paymentData) {
        try {
            const { amount, description, merchantId } = paymentData;

            // Validation
            if (!amount || !merchantId) {
                throw new Error('Amount and merchantId are required');
            }

            const numericAmount = parseFloat(amount);
            if (isNaN(numericAmount) || numericAmount <= 0) {
                throw new Error('Amount must be a valid number greater than 0');
            }

            if (typeof merchantId !== 'string' || merchantId.trim().length === 0) {
                throw new Error('MerchantId must be a valid string');
            }

            const paymentId = this.generatePaymentId();
            const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

            const newPaymentRequest = {
                id: paymentId,
                amount: numericAmount,
                description: description || '',
                merchantId: merchantId.trim(),
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
                paymentUrl: `${baseUrl}/api/payments/${paymentId}/process`,
                qrData: JSON.stringify({
                    paymentId: paymentId,
                    amount: numericAmount,
                    description: description || '',
                    merchantId: merchantId.trim(),
                    url: `${baseUrl}/api/payments/${paymentId}/process`
                })
            };

            const paymentRequests = this.getAllPaymentRequests();
            paymentRequests.push(newPaymentRequest);
            this.database.set('paymentRequests', paymentRequests);

            await this.saveDataToFile();

            console.log(`Payment request created: ${paymentId} - €${numericAmount} for ${merchantId}`);
            return newPaymentRequest;

        } catch (error) {
            console.error('Error creating payment request:', error.message);
            throw error;
        }
    }

    async updatePaymentRequestStatus(paymentId, status, additionalData = {}) {
        try {
            const paymentRequests = this.getAllPaymentRequests();
            const requestIndex = paymentRequests.findIndex(req => req.id === paymentId);

            if (requestIndex === -1) {
                throw new Error('Payment request not found');
            }

            const paymentRequest = paymentRequests[requestIndex];

            // Validate status transitions
            const validStatuses = ['pending', 'processing', 'completed', 'failed', 'expired', 'cancelled'];
            if (!validStatuses.includes(status)) {
                throw new Error(`Invalid status: ${status}. Valid statuses: ${validStatuses.join(', ')}`);
            }

            paymentRequest.status = status;
            paymentRequest.updatedAt = new Date().toISOString();

            // Add any additional data
            Object.assign(paymentRequest, additionalData);

            paymentRequests[requestIndex] = paymentRequest;
            this.database.set('paymentRequests', paymentRequests);

            await this.saveDataToFile();

            console.log(`Payment request ${paymentId} status updated to: ${status}`);
            return paymentRequest;

        } catch (error) {
            console.error('Error updating payment request status:', error.message);
            throw error;
        }
    }

    async expireOldPaymentRequests() {
        try {
            const paymentRequests = this.getAllPaymentRequests();
            const now = new Date().toISOString();
            let expiredCount = 0;

            const updatedRequests = paymentRequests.map(req => {
                if (req.status === 'pending' && req.expiresAt <= now) {
                    expiredCount++;
                    return {
                        ...req,
                        status: 'expired',
                        updatedAt: now
                    };
                }
                return req;
            });

            if (expiredCount > 0) {
                this.database.set('paymentRequests', updatedRequests);
                await this.saveDataToFile();
                console.log(`Expired ${expiredCount} old payment requests`);
            }

            return expiredCount;

        } catch (error) {
            console.error('Error expiring old payment requests:', error.message);
            throw error;
        }
    }

    // PAYMENT ATTEMPTS METHODS (includes successful and failed)
    getAllPayments() {
        return this.database.get('payments') || [];
    }

    getSuccessfulPayments() {
        const payments = this.getAllPayments();
        return payments.filter(payment => payment.status === 'completed');
    }

    getPaymentsByAccountId(accountId) {
        const payments = this.getAllPayments();
        return payments.filter(payment => payment.accountId === accountId);
    }

    getPaymentsByMerchantId(merchantId) {
        const payments = this.getAllPayments();
        return payments.filter(payment => payment.merchantId === merchantId);
    }

    getPaymentsInDateRange(startDate, endDate) {
        const payments = this.getAllPayments();
        return payments.filter(payment => {
            const paymentDate = payment.timestamp;
            return paymentDate >= startDate && paymentDate <= endDate;
        });
    }

    // NEW: Get consecutive PIN failures for security
    getConsecutivePinFailures(accountId) {
        const payments = this.getPaymentsByAccountId(accountId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Most recent first

        let consecutiveFailures = 0;

        for (const payment of payments) {
            if (payment.status === 'failed_pin') {
                consecutiveFailures++;
            } else if (payment.status === 'completed') {
                // Reset counter when we find a successful payment
                break;
            }
            // Continue counting for other statuses (expired, insufficient funds, etc.)
        }

        console.log(`Account ${accountId} has ${consecutiveFailures} consecutive PIN failures`);
        return consecutiveFailures;
    }

    // NEW: Record any payment attempt (successful or failed)
    async recordPaymentAttempt(paymentData) {
        try {
            const requiredFields = ['paymentRequestId', 'status'];
            for (const field of requiredFields) {
                if (!paymentData[field]) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }

            // Validate status
            const validStatuses = ['completed', 'failed_pin', 'failed_expired', 'failed_insufficient_funds', 'failed_invalid_credential', 'failed_invalid_state'];
            if (!validStatuses.includes(paymentData.status)) {
                throw new Error(`Invalid payment status: ${paymentData.status}`);
            }

            const payments = this.getAllPayments();
            const paymentAttempt = {
                id: this.generatePaymentId(),
                paymentRequestId: paymentData.paymentRequestId,
                status: paymentData.status,
                amount: parseFloat(paymentData.amount) || 0,
                merchantId: paymentData.merchantId || null,
                description: paymentData.description || '',
                timestamp: new Date().toISOString(),

                // Account details (when available)
                accountId: paymentData.accountId || null,
                cardholderName: paymentData.cardholderName || null,
                accountEmail: paymentData.accountEmail || null,

                // Transaction details (for successful payments)
                transactionId: paymentData.transactionId || null,
                previousBalance: paymentData.previousBalance || null,
                newBalance: paymentData.newBalance || null,

                // Error details (for failed payments)
                errorReason: paymentData.errorReason || null,
                errorDetails: paymentData.errorDetails || null,

                // Security tracking
                attemptNumber: paymentData.attemptNumber || null,
                clientIp: paymentData.clientIp || null,
                userAgent: paymentData.userAgent || null
            };

            payments.push(paymentAttempt);
            this.database.set('payments', payments);

            await this.saveDataToFile();

            const statusEmoji = paymentData.status === 'completed' ? '✅' : '❌';
            console.log(`${statusEmoji} Payment attempt recorded: ${paymentAttempt.id} - Status: ${paymentData.status}`);

            return paymentAttempt;

        } catch (error) {
            console.error('Error recording payment attempt:', error.message);
            throw error;
        }
    }

    // LEGACY: Keep for backward compatibility
    async recordCompletedPayment(paymentData) {
        return await this.recordPaymentAttempt({
            ...paymentData,
            status: 'completed'
        });
    }

    // STATISTICS AND REPORTING
    getPaymentStatistics() {
        const paymentRequests = this.getAllPaymentRequests();
        const allPayments = this.getAllPayments();
        const successfulPayments = this.getSuccessfulPayments();

        const stats = {
            paymentRequests: {
                total: paymentRequests.length,
                pending: paymentRequests.filter(req => req.status === 'pending').length,
                completed: paymentRequests.filter(req => req.status === 'completed').length,
                failed: paymentRequests.filter(req => req.status === 'failed').length,
                expired: paymentRequests.filter(req => req.status === 'expired').length,
                cancelled: paymentRequests.filter(req => req.status === 'cancelled').length
            },
            paymentAttempts: {
                total: allPayments.length,
                successful: successfulPayments.length,
                failed_pin: allPayments.filter(p => p.status === 'failed_pin').length,
                failed_expired: allPayments.filter(p => p.status === 'failed_expired').length,
                failed_insufficient_funds: allPayments.filter(p => p.status === 'failed_insufficient_funds').length,
                failed_invalid_credential: allPayments.filter(p => p.status === 'failed_invalid_credential').length,
                totalAmount: successfulPayments.reduce((sum, payment) => sum + payment.amount, 0),
                averageAmount: successfulPayments.length > 0
                    ? successfulPayments.reduce((sum, payment) => sum + payment.amount, 0) / successfulPayments.length
                    : 0
            }
        };

        return stats;
    }

    getMerchantStatistics(merchantId) {
        const merchantRequests = this.getPaymentRequestsByMerchant(merchantId);
        const merchantPayments = this.getPaymentsByMerchantId(merchantId);
        const successfulMerchantPayments = merchantPayments.filter(p => p.status === 'completed');

        return {
            merchantId: merchantId,
            paymentRequests: {
                total: merchantRequests.length,
                pending: merchantRequests.filter(req => req.status === 'pending').length,
                completed: merchantRequests.filter(req => req.status === 'completed').length
            },
            paymentAttempts: {
                total: merchantPayments.length,
                successful: successfulMerchantPayments.length,
                failed: merchantPayments.length - successfulMerchantPayments.length,
                totalAmount: successfulMerchantPayments.reduce((sum, payment) => sum + payment.amount, 0),
                averageAmount: successfulMerchantPayments.length > 0
                    ? successfulMerchantPayments.reduce((sum, payment) => sum + payment.amount, 0) / successfulMerchantPayments.length
                    : 0
            }
        };
    }

    // NEW: Security statistics per account
    getSecurityStatistics(accountId) {
        const accountPayments = this.getPaymentsByAccountId(accountId);
        const consecutiveFailures = this.getConsecutivePinFailures(accountId);

        return {
            accountId: accountId,
            totalAttempts: accountPayments.length,
            successfulPayments: accountPayments.filter(p => p.status === 'completed').length,
            pinFailures: accountPayments.filter(p => p.status === 'failed_pin').length,
            consecutivePinFailures: consecutiveFailures,
            lastAttempt: accountPayments.length > 0
                ? accountPayments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
                : null,
            riskLevel: consecutiveFailures >= 4 ? 'HIGH' : consecutiveFailures >= 2 ? 'MEDIUM' : 'LOW'
        };
    }

    // CLEANUP METHODS
    async cleanupExpiredRequests(olderThanHours = 24) {
        try {
            const cutoffTime = new Date(Date.now() - (olderThanHours * 60 * 60 * 1000)).toISOString();
            const paymentRequests = this.getAllPaymentRequests();

            const validRequests = paymentRequests.filter(req => {
                // Keep pending requests that are not expired
                // Keep completed/failed requests from the last 24 hours for reference
                if (req.status === 'pending') {
                    return req.expiresAt > new Date().toISOString();
                }
                return req.updatedAt > cutoffTime;
            });

            const removedCount = paymentRequests.length - validRequests.length;

            if (removedCount > 0) {
                this.database.set('paymentRequests', validRequests);
                await this.saveDataToFile();
                console.log(`Cleaned up ${removedCount} old payment requests`);
            }

            return removedCount;

        } catch (error) {
            console.error('Error cleaning up expired requests:', error.message);
            throw error;
        }
    }
}

module.exports = PaymentService;