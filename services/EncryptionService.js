const crypto = require('crypto');

class EncryptionService {
    constructor() {
        this.salt = process.env.ENCRYPTION_SALT;
        this.algorithm = process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm';
        this.keyLength = parseInt(process.env.ENCRYPTION_KEY_LENGTH) || 32;

        if (!this.salt) {
            throw new Error('ENCRYPTION_SALT must be set in environment variables');
        }

        if (this.salt.length < 16) {
            throw new Error('ENCRYPTION_SALT must be at least 16 characters long');
        }
    }

    /**
     * Generate encryption key from salt and additional data
     * @param {string} additionalData - Additional data for key derivation
     * @returns {Buffer} Derived key
     */
    deriveKey(additionalData = '') {
        const keyMaterial = this.salt + additionalData;
        return crypto.pbkdf2Sync(keyMaterial, 'procivis-banking', 100000, this.keyLength, 'sha256');
    }

    /**
     * Encrypt card data into ECD format
     * @param {Object} cardData - Card data to encrypt
     * @param {string} cardData.pan - Full PAN number
     * @param {string} cardData.expiryDate - Expiry date (MM/YY)
     * @param {string} cardData.cvc - CVC code
     * @param {string} accountId - Account ID for key derivation
     * @returns {string} Encrypted ECD string
     */
    encryptCardData(cardData, accountId) {
        try {
            console.log('=== ENCRYPTION START ===');
            console.log('Encrypting card data for account:', accountId);

            // Validate input data
            this.validateCardData(cardData);

            // Create payload with timestamp for additional security
            const payload = {
                pan: cardData.pan,
                expiryDate: cardData.expiryDate,
                cvc: cardData.cvc,
                timestamp: new Date().toISOString(),
                accountId: accountId
            };

            const plaintext = JSON.stringify(payload);
            console.log('Payload created, length:', plaintext.length);

            // Derive key using account ID for additional entropy
            const key = this.deriveKey(accountId);

            // Generate random IV for each encryption
            const iv = crypto.randomBytes(16);

            // Create cipher
            const cipher = crypto.createCipher(this.algorithm, key, { iv });

            // Encrypt data
            let encrypted = cipher.update(plaintext, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Get authentication tag for GCM mode
            const authTag = cipher.getAuthTag ? cipher.getAuthTag() : Buffer.alloc(0);

            // Combine IV, auth tag, and encrypted data
            const result = {
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                data: encrypted
            };

            const ecd = Buffer.from(JSON.stringify(result)).toString('base64');

            console.log('Encryption successful, ECD length:', ecd.length);
            console.log('=== ENCRYPTION END ===');

            return ecd;

        } catch (error) {
            console.error('=== ENCRYPTION ERROR ===');
            console.error('Encryption failed:', error.message);
            throw new Error(`Failed to encrypt card data: ${error.message}`);
        }
    }

    /**
     * Decrypt ECD to get card data
     * @param {string} ecd - Encrypted ECD string
     * @param {string} accountId - Account ID for key derivation
     * @returns {Object} Decrypted card data
     */
    decryptCardData(ecd, accountId) {
        try {
            console.log('=== DECRYPTION START ===');
            console.log('Decrypting ECD for account:', accountId);
            console.log('ECD length:', ecd.length);

            // Parse ECD
            const encryptedData = JSON.parse(Buffer.from(ecd, 'base64').toString('utf8'));

            // Derive the same key
            const key = this.deriveKey(accountId);

            // Extract components
            const iv = Buffer.from(encryptedData.iv, 'hex');
            const authTag = Buffer.from(encryptedData.authTag, 'hex');
            const encrypted = encryptedData.data;

            // Create decipher
            const decipher = crypto.createDecipher(this.algorithm, key, { iv });

            // Set auth tag for GCM mode
            if (decipher.setAuthTag && authTag.length > 0) {
                decipher.setAuthTag(authTag);
            }

            // Decrypt data
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            const payload = JSON.parse(decrypted);

            // Validate decrypted data
            this.validateDecryptedPayload(payload, accountId);

            console.log('Decryption successful');
            console.log('=== DECRYPTION END ===');

            return {
                pan: payload.pan,
                expiryDate: payload.expiryDate,
                cvc: payload.cvc,
                timestamp: payload.timestamp
            };

        } catch (error) {
            console.error('=== DECRYPTION ERROR ===');
            console.error('Decryption failed:', error.message);
            throw new Error(`Failed to decrypt card data: ${error.message}`);
        }
    }

    /**
     * Validate card data before encryption
     * @param {Object} cardData - Card data to validate
     */
    validateCardData(cardData) {
        if (!cardData.pan || typeof cardData.pan !== 'string') {
            throw new Error('PAN is required and must be a string');
        }

        if (!cardData.expiryDate || typeof cardData.expiryDate !== 'string') {
            throw new Error('Expiry date is required and must be a string');
        }

        if (!cardData.cvc || typeof cardData.cvc !== 'string') {
            throw new Error('CVC is required and must be a string');
        }

        // Validate PAN format (13-19 digits)
        const panRegex = /^\d{13,19}$/;
        if (!panRegex.test(cardData.pan.replace(/[\s-]/g, ''))) {
            throw new Error('Invalid PAN format');
        }

        // Validate expiry date format (MM/YY)
        const expiryRegex = /^(0[1-9]|1[0-2])\/\d{2}$/;
        if (!expiryRegex.test(cardData.expiryDate)) {
            throw new Error('Invalid expiry date format (MM/YY)');
        }

        // Validate CVC format (3-4 digits)
        const cvcRegex = /^\d{3,4}$/;
        if (!cvcRegex.test(cardData.cvc)) {
            throw new Error('Invalid CVC format (3-4 digits)');
        }
    }

    /**
     * Validate decrypted payload
     * @param {Object} payload - Decrypted payload
     * @param {string} expectedAccountId - Expected account ID
     */
    validateDecryptedPayload(payload, expectedAccountId) {
        if (!payload.accountId || payload.accountId !== expectedAccountId) {
            throw new Error('Account ID mismatch in decrypted data');
        }

        if (!payload.timestamp) {
            throw new Error('Missing timestamp in decrypted data');
        }

        // Check if data is not too old (optional security check)
        const dataAge = Date.now() - new Date(payload.timestamp).getTime();
        const maxAge = 365 * 24 * 60 * 60 * 1000; // 1 year

        if (dataAge > maxAge) {
            console.warn('Decrypted data is older than 1 year');
        }
    }

    /**
     * Generate a secure random salt
     * @param {number} length - Length of salt (default 32)
     * @returns {string} Random salt
     */
    static generateSalt(length = 32) {
        return crypto.randomBytes(length).toString('hex').substring(0, length);
    }

    /**
     * Check if encryption service is properly configured
     * @returns {boolean} True if configured
     */
    isConfigured() {
        return !!(this.salt && this.salt.length >= 16);
    }
}

module.exports = EncryptionService;