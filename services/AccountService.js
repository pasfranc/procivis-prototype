const fs = require('fs').promises;
const path = require('path');
const EncryptionService = require('./EncryptionService');

class AccountService {
    constructor(dataFilePath) {
        this.dataFilePath = dataFilePath || process.env.DATA_FILE_PATH || path.join(process.cwd(), 'data.json');
        this.database = new Map();
        this.encryptionService = new EncryptionService();
    }

    async initialize() {
        console.log('Initializing AccountService...');
        await this.loadDataFromFile();
        console.log('AccountService initialization complete');
    }

    async loadDataFromFile() {
        try {
            console.log('Loading accounts data from file:', this.dataFilePath);

            try {
                await fs.access(this.dataFilePath);
            } catch (error) {
                console.log('Accounts data file not found, creating empty data.json');
                await this.saveDataToFile();
                return;
            }

            const fileContent = await fs.readFile(this.dataFilePath, 'utf8');

            if (!fileContent.trim()) {
                console.log('Accounts data file is empty, initializing with empty data');
                return;
            }

            const jsonData = JSON.parse(fileContent);

            if (jsonData.accounts && Array.isArray(jsonData.accounts)) {
                this.database.set('accounts', jsonData.accounts);
                console.log(`Loaded ${jsonData.accounts.length} accounts from data.json`);
            } else {
                this.database.set('accounts', []);
                console.log('No accounts found in data.json, initialized empty accounts array');
            }

        } catch (error) {
            console.error('Error loading accounts data from file:', error.message);
            this.database.set('accounts', []);
        }
    }

    async saveDataToFile() {
        try {
            const dataToSave = {
                accounts: this.database.get('accounts') || [],
                lastUpdated: new Date().toISOString(),
                securityNotice: "This file contains sensitive financial data. Ensure proper encryption and access controls in production."
            };

            await fs.writeFile(this.dataFilePath, JSON.stringify(dataToSave, null, 2), 'utf8');

            // Set restrictive file permissions in production
            if (process.env.NODE_ENV === 'production') {
                try {
                    await fs.chmod(this.dataFilePath, 0o600); // Owner read/write only
                    console.log('Restrictive file permissions set for data file');
                } catch (permError) {
                    console.warn('Could not set restrictive file permissions:', permError.message);
                }
            }

            console.log('Accounts data saved to file successfully');

        } catch (error) {
            console.error('Error saving accounts data to file:', error.message);
            throw error;
        }
    }

    // UTILITY METHODS
    generatePIN() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    generateAccountId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    // VALIDATION METHODS
    validateExpiryDate(expiryDate) {
        const regex = /^(0[1-9]|1[0-2])\/\d{2}$/;
        if (!regex.test(expiryDate)) {
            return false;
        }

        const [month, year] = expiryDate.split('/');
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear() % 100;
        const currentMonth = currentDate.getMonth() + 1;

        const expYear = parseInt(year);
        const expMonth = parseInt(month);

        if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
            return false;
        }

        return true;
    }

    validateCVC(cvc) {
        const cvcRegex = /^\d{3,4}$/;
        return cvcRegex.test(cvc);
    }

    validatePAN(pan) {
        const cleanPAN = pan.replace(/[\s-]/g, '');
        const regex = /^\d{13,19}$/;
        return regex.test(cleanPAN);
    }

    // DISPLAY HELPER METHODS
    maskPAN(pan) {
        if (!pan || pan.length < 8) return pan;
        const start = pan.substring(0, 4);
        const end = pan.substring(pan.length - 4);
        const middle = '*'.repeat(pan.length - 8);
        return `${start}${middle}${end}`;
    }

    // ACCOUNT RETRIEVAL METHODS
    getAllAccounts() {
        return this.database.get('accounts') || [];
    }

    getAllAccountsForAPI() {
        const accounts = this.getAllAccounts();
        return accounts.map(account => {
            const { encryptedECD, cvc, pin, ...publicAccount } = account;
            return {
                ...publicAccount,
                panMasked: this.maskPAN(account.pan),
                cvcMasked: account.cvc ? '*'.repeat(account.cvc.length) : null
            };
        });
    }

    getAccountCount() {
        return this.getAllAccounts().length;
    }

    getAccountById(accountId) {
        console.log(`Looking for account with ID: ${accountId}`);
        const accounts = this.getAllAccounts();
        const account = accounts.find(acc => acc.id === accountId);

        if (account) {
            console.log(`Account found: ${account.cardholderName} (${account.email})`);
        } else {
            console.log(`Account not found for ID: ${accountId}`);
        }

        return account || null;
    }

    getAccountByEmail(email) {
        const accounts = this.getAllAccounts();
        return accounts.find(acc => acc.email.toLowerCase() === email.toLowerCase()) || null;
    }

    getAccountByPAN(pan) {
        const cleanPAN = pan.replace(/[\s-]/g, '');
        const accounts = this.getAllAccounts();
        return accounts.find(acc => acc.pan.replace(/[\s-]/g, '') === cleanPAN) || null;
    }

    // CREDENTIAL MANAGEMENT METHODS
    async updateAccountCredential(accountId, credentialId) {
        try {
            console.log(`Updating account ${accountId} with credential ${credentialId}`);

            const accounts = this.getAllAccounts();
            const accountIndex = accounts.findIndex(acc => acc.id === accountId);

            if (accountIndex === -1) {
                throw new Error(`Account not found with ID: ${accountId}`);
            }

            const account = accounts[accountIndex];

            // If there was a previous credential, keep track of it
            if (account.credentialId && account.credentialId !== credentialId) {
                account.credentialHistory = account.credentialHistory || [];
                account.credentialHistory.push({
                    credentialId: account.credentialId,
                    replacedAt: new Date().toISOString()
                });
            }

            // Update with new credential
            account.credentialId = credentialId;
            account.credentialCreatedAt = new Date().toISOString();

            // Update the accounts array
            accounts[accountIndex] = account;
            this.database.set('accounts', accounts);

            await this.saveDataToFile();

            console.log(`Account updated successfully: ${account.cardholderName} now has credential ${credentialId}`);
            return account;

        } catch (error) {
            console.error('Error updating account credential:', error.message);
            throw error;
        }
    }

    getCredentialStatus(accountId) {
        const account = this.getAccountById(accountId);

        if (!account) {
            return {
                hasCredential: false,
                credentialId: null,
                credentialCreatedAt: null,
                error: 'Account not found'
            };
        }

        return {
            hasCredential: !!account.credentialId,
            credentialId: account.credentialId || null,
            credentialCreatedAt: account.credentialCreatedAt || null,
            credentialHistory: account.credentialHistory || [],
            accountId: account.id,
            cardholderName: account.cardholderName
        };
    }

    // BALANCE MANAGEMENT METHODS
    async updateAccountBalance(accountId, newBalance, description = '') {
        try {
            const accounts = this.getAllAccounts();
            const accountIndex = accounts.findIndex(account => account.id === accountId);

            if (accountIndex === -1) {
                throw new Error('Account not found');
            }

            const account = accounts[accountIndex];
            const oldBalance = account.balance;

            account.balance = parseFloat(newBalance);
            account.lastBalanceUpdate = {
                previousBalance: oldBalance,
                newBalance: account.balance,
                description: description,
                timestamp: new Date().toISOString()
            };

            accounts[accountIndex] = account;
            this.database.set('accounts', accounts);

            await this.saveDataToFile();

            console.log(`Account balance updated: ${account.cardholderName} - €${oldBalance} → €${account.balance}`);
            return account;

        } catch (error) {
            console.error('Error updating account balance:', error.message);
            throw error;
        }
    }

    // ENCRYPTED CARD DATA METHODS
    getDecryptedCardData(accountId) {
        const account = this.getAccountById(accountId);

        if (!account) {
            throw new Error('Account not found');
        }

        if (!account.encryptedECD) {
            throw new Error('No encrypted card data found for this account');
        }

        try {
            return this.encryptionService.decryptCardData(account.encryptedECD, accountId);
        } catch (error) {
            console.error('Failed to decrypt card data for account:', accountId, error.message);
            throw new Error('Failed to decrypt card data');
        }
    }

    async verifyAccountDataIntegrity(accountId) {
        try {
            const account = this.getAccountById(accountId);
            if (!account) {
                return { valid: false, error: 'Account not found' };
            }

            if (account.encryptedECD) {
                try {
                    const decryptedData = this.getDecryptedCardData(accountId);

                    const dataMatches = {
                        pan: decryptedData.pan === account.pan,
                        expiryDate: decryptedData.expiryDate === account.expiryDate,
                        cvc: decryptedData.cvc === account.cvc
                    };

                    const allMatch = Object.values(dataMatches).every(Boolean);

                    return {
                        valid: allMatch,
                        encryptionWorking: true,
                        dataMatches: dataMatches,
                        message: allMatch ? 'Data integrity verified' : 'Data mismatch detected'
                    };

                } catch (decryptError) {
                    return {
                        valid: false,
                        encryptionWorking: false,
                        error: 'Failed to decrypt ECD data',
                        details: decryptError.message
                    };
                }
            } else {
                return {
                    valid: false,
                    error: 'No encrypted ECD data found'
                };
            }

        } catch (error) {
            return {
                valid: false,
                error: 'Verification failed',
                details: error.message
            };
        }
    }

    // ACCOUNT CREATION METHOD
    async createAccount(accountData) {
        const { email, pan, expiryDate, cardholderName, balance, cvc } = accountData;

        // Validation
        if (!email || !pan || !expiryDate || !cardholderName || balance === undefined || !cvc) {
            throw new Error('All fields are required: email, pan, expiryDate, cardholderName, balance, cvc');
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Please provide a valid email address');
        }

        if (!this.validatePAN(pan)) {
            throw new Error('Invalid PAN (card number). Must be 13-19 digits');
        }

        if (!this.validateExpiryDate(expiryDate)) {
            throw new Error('Invalid expiry date. Use MM/YY format and ensure the card is not expired');
        }

        if (cardholderName.trim().length < 2) {
            throw new Error('Cardholder name must be at least 2 characters long');
        }

        if (!this.validateCVC(cvc)) {
            throw new Error('Invalid CVC. Must be 3-4 digits');
        }

        const numericBalance = parseFloat(balance);
        if (isNaN(numericBalance) || numericBalance < 0) {
            throw new Error('Balance must be a valid number greater than or equal to 0');
        }

        const accounts = this.getAllAccounts();

        // Check duplicates
        const existingAccountByEmail = accounts.find(account =>
            account.email.toLowerCase() === email.toLowerCase()
        );
        if (existingAccountByEmail) {
            throw new Error('An account with this email already exists');
        }

        const cleanPAN = pan.replace(/[\s-]/g, '');
        const existingAccountByPAN = accounts.find(account =>
            account.pan.replace(/[\s-]/g, '') === cleanPAN
        );
        if (existingAccountByPAN) {
            throw new Error('An account with this card number already exists');
        }

        // Create new account
        const accountId = this.generateAccountId();

        // Create encrypted ECD with card data
        let encryptedECD = null;
        try {
            encryptedECD = this.encryptionService.encryptCardData({
                pan: cleanPAN,
                expiryDate: expiryDate.trim(),
                cvc: cvc.trim()
            }, accountId);

            console.log('Card data encrypted successfully for account:', accountId);
        } catch (error) {
            console.error('Failed to encrypt card data:', error.message);
            throw new Error('Failed to secure card data');
        }

        const newAccount = {
            id: accountId,
            email: email.trim().toLowerCase(),
            pin: this.generatePIN(),
            pan: cleanPAN,
            expiryDate: expiryDate.trim(),
            cvc: cvc.trim(),
            cardholderName: cardholderName.trim(),
            balance: numericBalance,
            createdAt: new Date().toISOString(),
            // Credential-related fields
            credentialId: null,
            credentialCreatedAt: null,
            credentialHistory: [],
            // Encrypted card data for payments
            encryptedECD: encryptedECD
        };

        // Add to database
        accounts.push(newAccount);
        this.database.set('accounts', accounts);

        await this.saveDataToFile();

        console.log(`New account created: ${newAccount.cardholderName} (${newAccount.email}) - Balance: €${newAccount.balance}`);

        // Return account without sensitive data for API responses
        const { encryptedECD: _, cvc: __, pin: ___, ...publicAccount } = newAccount;
        return {
            ...publicAccount,
            panMasked: this.maskPAN(newAccount.pan),
            cvcMasked: '*'.repeat(newAccount.cvc.length)
        };
    }
}

module.exports = AccountService;