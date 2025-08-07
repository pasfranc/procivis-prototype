// Import fetch dynamically for Node.js compatibility
let fetch;

class ProcivisService {
    constructor() {
        // Load configuration from environment variables
        this.clientSecret = process.env.PROCIVIS_CLIENT_SECRET;
        this.baseUrl = process.env.PROCIVIS_BASE_URL || 'https://api.trial.procivis-one.com';
        this.keycloakUrl = process.env.PROCIVIS_KEYCLOAK_URL || 'https://keycloak.trial.procivis-one.com';
        this.clientId = process.env.PROCIVIS_CLIENT_ID || 'one-procivis-po';

        // Credential configuration
        this.credentialSchemaId = process.env.PROCIVIS_CREDENTIAL_SCHEMA_ID;
        this.issuerId = process.env.PROCIVIS_ISSUER_ID;
        this.issuerKeyId = process.env.PROCIVIS_ISSUER_KEY_ID;
        this.redirectUri = process.env.PROCIVIS_REDIRECT_URI; // Optional for prototypes

        // Proof request configuration
        this.proofSchemaId = process.env.PROCIVIS_PROOF_SCHEMA_ID;

        // Claim IDs
        this.claimIds = {
            cardHolderName: process.env.PROCIVIS_CLAIM_CARDHOLDER_NAME_ID,
            last4Digits: process.env.PROCIVIS_CLAIM_LAST4_DIGITS_ID,
            issuanceDate: process.env.PROCIVIS_CLAIM_ISSUANCE_DATE_ID,
            expirationDate: process.env.PROCIVIS_CLAIM_EXPIRATION_DATE_ID,
            ecd: process.env.PROCIVIS_CLAIM_ECD_ID
        };

        // Runtime state
        this.accessToken = null;
        this.tokenExpiresAt = null;
        this.fetchInitialized = false;
    }

    async initialize() {
        console.log('Initializing Procivis service...');

        // Validate required configuration
        this.validateConfiguration();

        // Initialize fetch if not already done
        if (!this.fetchInitialized) {
            try {
                const nodeFetch = await import('node-fetch');
                fetch = nodeFetch.default;
                this.fetchInitialized = true;
                console.log('Node-fetch initialized successfully');
            } catch (error) {
                console.error('Failed to initialize node-fetch:', error.message);
                throw new Error('Failed to initialize HTTP client');
            }
        }

        if (this.isConfigured()) {
            console.log('Procivis service configured successfully');
            console.log('Base URL:', this.baseUrl);
            console.log('Schema ID:', this.credentialSchemaId);
            console.log('Issuer ID:', this.issuerId);
        } else {
            console.log('Procivis service not configured - missing required environment variables');
        }
    }

    /**
     * Validate that all required configuration is present
     */
    validateConfiguration() {
        const required = [
            'PROCIVIS_CLIENT_SECRET',
            'PROCIVIS_CREDENTIAL_SCHEMA_ID',
            'PROCIVIS_ISSUER_ID',
            'PROCIVIS_ISSUER_KEY_ID',
            'PROCIVIS_PROOF_SCHEMA_ID'
        ];

        const missing = required.filter(key => !process.env[key]);

        if (missing.length > 0) {
            console.warn('Missing required Procivis configuration:', missing);
            console.warn('Please set these environment variables in your .env file');
        }

        // Validate claim IDs
        const missingClaims = Object.entries(this.claimIds)
            .filter(([key, value]) => !value)
            .map(([key]) => key);

        if (missingClaims.length > 0) {
            console.warn('Missing claim ID configuration for:', missingClaims);
        }
    }

    isConfigured() {
        return !!(this.clientSecret && this.credentialSchemaId && this.issuerId && this.issuerKeyId && this.proofSchemaId);
    }

    /**
     * Create a card credential using Procivis API
     * @param {Object} accountData - Account data for the credential
     * @param {string} accountData.id - Account ID
     * @param {string} accountData.cardholderName - Cardholder name
     * @param {string} accountData.pan - Card number (PAN)
     * @param {string} accountData.expiryDate - Card expiry date (MM/YY)
     * @returns {Promise<Object>} Result with credentialId
     */
    async createCardCredential(accountData) {
        console.log('=== PROCIVIS CREATE CREDENTIAL START ===');
        console.log('Account data received:', {
            id: accountData.id,
            cardholderName: accountData.cardholderName,
            pan: accountData.pan ? `****${accountData.pan.slice(-4)}` : 'N/A',
            expiryDate: accountData.expiryDate
        });

        // Check if service is configured
        if (!this.isConfigured()) {
            throw new Error('Procivis service is not configured. Please check PROCIVIS_CLIENT_SECRET');
        }

        // Check if we have a valid access token
        if (!this.accessToken) {
            console.log('No access token available, attempting to authenticate...');
            await this.authenticate();
        }

        try {
            // Convert MM/YY expiry date to YYYY-MM-DD format for Procivis
            const convertExpiryDate = (mmyy) => {
                const [month, year] = mmyy.split('/');
                const fullYear = parseInt(year) < 50 ? `20${year}` : `19${year}`;
                return `${fullYear}-${month.padStart(2, '0')}-01`;
            };

            // Prepare credential data for Procivis API
            const credentialData = {
                credentialSchemaId: this.credentialSchemaId,
                issuer: this.issuerId,
                issuerKey: this.issuerKeyId,
                protocol: "OPENID4VCI_DRAFT13",
                // redirectUri: this.redirectUri, // Commented out for localhost prototype
                claimValues: [
                    {
                        claimId: this.claimIds.cardHolderName,
                        value: accountData.cardholderName,
                        path: "cardHolderName"
                    },
                    {
                        claimId: this.claimIds.last4Digits,
                        value: accountData.pan.slice(-4),
                        path: "last4Digits"
                    },
                    {
                        claimId: this.claimIds.issuanceDate,
                        value: new Date().toISOString().split('T')[0], // Current date in YYYY-MM-DD
                        path: "issuanceDate"
                    },
                    {
                        claimId: this.claimIds.expirationDate,
                        value: convertExpiryDate(accountData.expiryDate),
                        path: "expirationDate"
                    },
                    {
                        claimId: this.claimIds.ecd,
                        value: accountData.encryptedECD || accountData.id, // Use encrypted ECD if available, fallback to account ID
                        path: "ecd"
                    }
                ]
            };

            console.log('Sending credential creation request to Procivis...');
            console.log('Credential data:', JSON.stringify(credentialData, null, 2));

            // Make API call to create credential
            const response = await fetch(`${this.baseUrl}/api/credential/v1`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(credentialData)
            });

            console.log('Procivis API response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Procivis API error response:', errorText);

                // Try to parse as JSON for better error message
                try {
                    const errorJson = JSON.parse(errorText);
                    throw new Error(`Procivis API error (${response.status}): ${errorJson.error || errorJson.message || 'Unknown error'}`);
                } catch (parseError) {
                    throw new Error(`Procivis API error (${response.status}): ${errorText}`);
                }
            }

            const result = await response.json();
            console.log('Credential created successfully:', result);

            if (!result.id) {
                throw new Error('Procivis API did not return a credential ID');
            }

            console.log('=== PROCIVIS CREATE CREDENTIAL SUCCESS ===');

            return {
                credentialId: result.id,
                procivisResponse: result
            };

        } catch (error) {
            console.error('=== PROCIVIS CREATE CREDENTIAL ERROR ===');
            console.error('Error details:', error.message);

            // If it's an authentication error, clear the token and try once more
            if (error.message.includes('401') || error.message.includes('Authentication')) {
                console.log('Authentication error detected, clearing token and retrying...');
                this.accessToken = null;

                try {
                    await this.authenticate();
                    // Recursive call - try once more with fresh token
                    return await this.createCardCredential(accountData);
                } catch (retryError) {
                    console.error('Retry after authentication also failed:', retryError.message);
                    throw new Error(`Authentication failed: ${retryError.message}`);
                }
            }

            throw error;
        }
    }

    /**
     * Share a credential and get the QR code URLs
     * @param {string} credentialId - Credential ID to share
     * @returns {Promise<Object>} Share result with URLs for QR code
     */
    async shareCredential(credentialId) {
        console.log('=== PROCIVIS SHARE CREDENTIAL START ===');
        console.log('Credential ID to share:', credentialId);

        // Check if service is configured
        if (!this.isConfigured()) {
            throw new Error('Procivis service is not configured. Please check PROCIVIS_CLIENT_SECRET');
        }

        // Ensure we have a valid token
        if (!this.accessToken) {
            console.log('No access token available, attempting to authenticate...');
            await this.authenticate();
        }

        try {
            // Make API call to share credential
            const response = await fetch(`${this.baseUrl}/api/credential/v1/${credentialId}/share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json'
                },
                body: '' // Empty body as per your working example
            });

            console.log('Procivis share API response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Procivis share API error response:', errorText);

                // Try to parse as JSON for better error message
                try {
                    const errorJson = JSON.parse(errorText);
                    throw new Error(`Procivis share API error (${response.status}): ${errorJson.error || errorJson.message || 'Unknown error'}`);
                } catch (parseError) {
                    throw new Error(`Procivis share API error (${response.status}): ${errorText}`);
                }
            }

            const result = await response.json();
            console.log('Credential shared successfully:', result);

            if (!result.url) {
                throw new Error('Procivis API did not return sharing URLs');
            }

            console.log('=== PROCIVIS SHARE CREDENTIAL SUCCESS ===');

            return {
                qrCodeUrl: result.url, // URL for mobile wallets (QR code)
                appUrl: result.appUrl, // URL for web browsers
                credentialId: credentialId,
                shareResponse: result
            };

        } catch (error) {
            console.error('=== PROCIVIS SHARE CREDENTIAL ERROR ===');
            console.error('Error details:', error.message);

            // If it's an authentication error, clear the token and try once more
            if (error.message.includes('401') || error.message.includes('Authentication')) {
                console.log('Authentication error detected, clearing token and retrying...');
                this.accessToken = null;

                try {
                    await this.authenticate();
                    // Recursive call - try once more with fresh token
                    return await this.shareCredential(credentialId);
                } catch (retryError) {
                    console.error('Retry after authentication also failed:', retryError.message);
                    throw new Error(`Authentication failed: ${retryError.message}`);
                }
            }

            throw error;
        }
    }

    /**
     * NEW: Suspend a credential - VERSIONE CORRETTA
     * @param {string} credentialId - Credential ID to suspend
     * @param {string} suspendEndDate - End date for suspension (ISO string)
     * @returns {Promise<Object>} Suspension result
     */
    async suspendCredential(credentialId, suspendEndDate) {
        console.log('=== PROCIVIS SUSPEND CREDENTIAL START ===');
        console.log('Credential ID to suspend:', credentialId);
        console.log('Suspend until:', suspendEndDate);

        // Check if service is configured
        if (!this.isConfigured()) {
            throw new Error('Procivis service is not configured. Please check PROCIVIS_CLIENT_SECRET');
        }

        // Ensure we have a valid token
        if (!this.accessToken) {
            console.log('No access token available, attempting to authenticate...');
            await this.authenticate();
        }

        try {
            const suspendData = {
                suspendEndDate: suspendEndDate
            };

            console.log('Sending credential suspension request to Procivis...');
            console.log('Suspend data:', JSON.stringify(suspendData, null, 2));

            // Make API call to suspend credential
            const response = await fetch(`${this.baseUrl}/api/credential/v1/${credentialId}/suspend`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(suspendData)
            });

            console.log('Procivis suspend API response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Procivis suspend API error response:', errorText);

                try {
                    const errorJson = JSON.parse(errorText);
                    throw new Error(`Procivis suspend API error (${response.status}): ${errorJson.error || errorJson.message || 'Unknown error'}`);
                } catch (parseError) {
                    throw new Error(`Procivis suspend API error (${response.status}): ${errorText}`);
                }
            }

            // Handle 204 No Content or other success responses
            let result = {};

            if (response.status === 204) {
                // No Content - success but no body
                result = {
                    status: 'SUSPENDED',
                    message: 'Credential suspended successfully',
                    suspendedAt: new Date().toISOString()
                };
                console.log('Credential suspended successfully (204 No Content)');
            } else {
                // Try to parse JSON response
                const responseText = await response.text();
                if (responseText.trim()) {
                    try {
                        result = JSON.parse(responseText);
                        console.log('Credential suspended successfully with JSON response:', result);
                    } catch (parseError) {
                        result = {
                            status: 'SUSPENDED',
                            message: 'Credential suspended successfully',
                            suspendedAt: new Date().toISOString(),
                            rawResponse: responseText
                        };
                        console.log('Credential suspended successfully with text response:', responseText);
                    }
                } else {
                    result = {
                        status: 'SUSPENDED',
                        message: 'Credential suspended successfully (empty response)',
                        suspendedAt: new Date().toISOString()
                    };
                    console.log('Credential suspended successfully (empty response)');
                }
            }

            console.log('=== PROCIVIS SUSPEND CREDENTIAL SUCCESS ===');

            return {
                credentialId: credentialId,
                suspendedUntil: suspendEndDate,
                procivisResponse: result
            };

        } catch (error) {
            console.error('=== PROCIVIS SUSPEND CREDENTIAL ERROR ===');
            console.error('Error details:', error.message);

            // Handle authentication errors
            if (error.message.includes('401') || error.message.includes('Authentication')) {
                console.log('Authentication error detected, clearing token and retrying...');
                this.accessToken = null;

                try {
                    await this.authenticate();
                    return await this.suspendCredential(credentialId, suspendEndDate);
                } catch (retryError) {
                    console.error('Retry after authentication also failed:', retryError.message);
                    throw new Error(`Authentication failed: ${retryError.message}`);
                }
            }

            throw error;
        }
    }

    /**
     * NEW: Revoke a credential
     * @param {string} credentialId - Credential ID to revoke
     * @returns {Promise<Object>} Revocation result
     */
    async revokeCredential(credentialId) {
        console.log('=== PROCIVIS REVOKE CREDENTIAL START ===');
        console.log('Credential ID to revoke:', credentialId);

        // Check if service is configured
        if (!this.isConfigured()) {
            throw new Error('Procivis service is not configured. Please check PROCIVIS_CLIENT_SECRET');
        }

        // Ensure we have a valid token
        if (!this.accessToken) {
            console.log('No access token available, attempting to authenticate...');
            await this.authenticate();
        }

        try {
            console.log('Sending credential revocation request to Procivis...');

            // Make API call to revoke credential (no body required)
            const response = await fetch(`${this.baseUrl}/api/credential/v1/${credentialId}/revoke`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json'
                }
                // No body for revoke
            });

            console.log('Procivis revoke API response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Procivis revoke API error response:', errorText);

                try {
                    const errorJson = JSON.parse(errorText);
                    throw new Error(`Procivis revoke API error (${response.status}): ${errorJson.error || errorJson.message || 'Unknown error'}`);
                } catch (parseError) {
                    throw new Error(`Procivis revoke API error (${response.status}): ${errorText}`);
                }
            }

            // Handle 204 No Content response (success but no body)
            let result = {};
            if (response.status !== 204) {
                result = await response.json();
            } else {
                result = { status: 'REVOKED', message: 'Credential revoked successfully' };
            }

            console.log('Credential revoked successfully:', result);

            console.log('=== PROCIVIS REVOKE CREDENTIAL SUCCESS ===');

            return {
                credentialId: credentialId,
                revokedAt: new Date().toISOString(),
                procivisResponse: result
            };

        } catch (error) {
            console.error('=== PROCIVIS REVOKE CREDENTIAL ERROR ===');
            console.error('Error details:', error.message);

            // Handle authentication errors
            if (error.message.includes('401') || error.message.includes('Authentication')) {
                console.log('Authentication error detected, clearing token and retrying...');
                this.accessToken = null;

                try {
                    await this.authenticate();
                    return await this.revokeCredential(credentialId);
                } catch (retryError) {
                    console.error('Retry after authentication also failed:', retryError.message);
                    throw new Error(`Authentication failed: ${retryError.message}`);
                }
            }

            throw error;
        }
    }

    /**
     * NEW: Get credential status
     * @param {string} credentialId - Credential ID to check
     * @returns {Promise<Object>} Credential status
     */
    async getCredentialStatus(credentialId) {
        console.log('Getting credential status for:', credentialId);

        // Ensure we have a valid token
        if (!this.accessToken) {
            await this.authenticate();
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/credential/v1/${credentialId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Procivis get credential API error (${response.status}): ${errorText}`);
            }

            const result = await response.json();
            console.log('Credential status retrieved:', result.status);

            return {
                credentialId: credentialId,
                status: result.status,
                isActive: result.status === 'ACTIVE',
                isSuspended: result.status === 'SUSPENDED',
                isRevoked: result.status === 'REVOKED',
                details: result
            };

        } catch (error) {
            console.error('Error getting credential status:', error.message);
            throw error;
        }
    }

    /**
     * Authenticate with Procivis using client credentials
     * @returns {Promise<string>} Access token
     */
    async authenticate() {
        console.log('Authenticating with Procivis...');

        if (!this.clientSecret) {
            throw new Error('PROCIVIS_CLIENT_SECRET not configured');
        }

        try {
            const response = await fetch(`${this.keycloakUrl}/realms/trial/protocol/openid-connect/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: this.clientId,
                    client_secret: this.clientSecret
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Authentication failed (${response.status}): ${errorText}`);
            }

            const tokenData = await response.json();
            this.accessToken = tokenData.access_token;
            this.tokenExpiresAt = Date.now() + (tokenData.expires_in * 1000);

            console.log('Authentication successful, token expires at:', new Date(this.tokenExpiresAt));

            return this.accessToken;

        } catch (error) {
            console.error('Authentication error:', error.message);
            throw error;
        }
    }

    /**
     * Check if current token is still valid
     * @returns {boolean} True if token is valid
     */
    isTokenValid() {
        return this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt;
    }

    /**
     * Get current access token, refreshing if necessary
     * @returns {Promise<string>} Valid access token
     */
    async getValidToken() {
        if (!this.isTokenValid()) {
            await this.authenticate();
        }
        return this.accessToken;
    }

    /**
     * Clear current authentication token
     */
    clearToken() {
        this.accessToken = null;
        this.tokenExpiresAt = null;
        console.log('Authentication token cleared');
    }

    /**
     * Get token information for debugging
     * @returns {Object} Token info
     */
    getTokenInfo() {
        return {
            hasToken: !!this.accessToken,
            expiresAt: this.tokenExpiresAt ? new Date(this.tokenExpiresAt) : null,
            isValid: this.isTokenValid(),
            timeToExpiry: this.tokenExpiresAt ? Math.max(0, this.tokenExpiresAt - Date.now()) : 0
        };
    }

    /**
     * Get Procivis service status
     * @returns {Object} Service status information
     */
    getStatus() {
        const tokenInfo = this.getTokenInfo();

        return {
            configured: this.isConfigured(),
            baseUrl: this.baseUrl,
            keycloakUrl: this.keycloakUrl,
            authentication: {
                hasToken: tokenInfo.hasToken,
                tokenValid: tokenInfo.isValid,
                expiresAt: tokenInfo.expiresAt,
                timeToExpiry: tokenInfo.timeToExpiry
            },
            lastError: null
        };
    }

    /**
     * Test authentication with Procivis
     * @returns {Promise<Object>} Test result
     */
    async testAuthentication() {
        try {
            if (!this.isConfigured()) {
                return {
                    success: false,
                    error: 'Service not configured'
                };
            }

            await this.authenticate();

            return {
                success: true,
                message: 'Authentication successful',
                tokenInfo: this.getTokenInfo()
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Refresh the authentication token
     * @returns {Promise<Object>} Refresh result
     */
    async refreshToken() {
        try {
            this.clearToken();
            await this.authenticate();

            return {
                success: true,
                message: 'Token refreshed successfully',
                tokenInfo: this.getTokenInfo()
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ========================================
    // PROOF REQUEST METHODS FOR PAYMENTS
    // ========================================

    /**
     * Create a proof request for payment verification
     * @returns {Promise<Object>} Result with proofRequestId
     */
    async createProofRequest() {
        console.log('=== PROCIVIS CREATE PROOF REQUEST START ===');

        // Check if service is configured
        if (!this.isConfigured()) {
            throw new Error('Procivis service is not configured. Please check configuration');
        }

        // Ensure we have a valid token
        if (!this.accessToken) {
            console.log('No access token available, attempting to authenticate...');
            await this.authenticate();
        }

        try {
            // Prepare proof request data
            const proofRequestData = {
                proofSchemaId: this.proofSchemaId,
                verifier: this.issuerId, // Same as issuer
                protocol: "OPENID4VP_DRAFT25",
                exchange: "OPENID4VP_DRAFT25",
                verifierKey: this.issuerKeyId, // Same as issuer key
                proofInputs: [
                    {
                        claims: [
                            {
                                schema: {
                                    id: this.claimIds.cardHolderName,
                                    required: true,
                                    key: "cardHolderName",
                                    dataType: "STRING",
                                    array: false
                                },
                                path: "cardHolderName"
                            },
                            {
                                schema: {
                                    id: this.claimIds.last4Digits,
                                    required: true,
                                    key: "last4Digits",
                                    dataType: "STRING",
                                    array: false
                                },
                                path: "last4Digits"
                            },
                            {
                                schema: {
                                    id: this.claimIds.issuanceDate,
                                    required: true,
                                    key: "issuanceDate",
                                    dataType: "DATE",
                                    array: false
                                },
                                path: "issuanceDate"
                            },
                            {
                                schema: {
                                    id: this.claimIds.expirationDate,
                                    required: true,
                                    key: "expirationDate",
                                    dataType: "DATE",
                                    array: false
                                },
                                path: "expirationDate"
                            },
                            {
                                schema: {
                                    id: this.claimIds.ecd,
                                    required: true,
                                    key: "ecd",
                                    dataType: "STRING",
                                    array: false
                                },
                                path: "ecd"
                            }
                        ],
                        validityConstraint: 7200, // 2 hours
                        credentialSchema: {
                            name: "pa_schema_v2",
                            format: "JSON_LD_CLASSIC",
                            revocationMethod: "LVVC",
                            walletStorageType: "SOFTWARE",
                            layoutType: "CARD",
                            allowSuspension: true,
                            externalSchema: false,
                            createdDate: "2025-07-31T15:08:59.210Z",
                            lastModified: "2025-07-31T15:08:59.210Z",
                            id: this.credentialSchemaId,
                            schemaId: `https://core.trial.procivis-one.com/ssi/schema/v1/${this.credentialSchemaId}`,
                            schemaType: "ProcivisOneSchema2024"
                        }
                    }
                ]
            };

            console.log('Sending proof request creation to Procivis...');

            // Make API call to create proof request
            const response = await fetch(`${this.baseUrl}/api/proof-request/v1`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(proofRequestData)
            });

            console.log('Procivis proof request API response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Procivis proof request API error response:', errorText);
                throw new Error(`Procivis proof request API error (${response.status}): ${errorText}`);
            }

            const result = await response.json();
            console.log('Proof request created successfully:', result);

            if (!result.id) {
                throw new Error('Procivis API did not return a proof request ID');
            }

            console.log('=== PROCIVIS CREATE PROOF REQUEST SUCCESS ===');

            return {
                proofRequestId: result.id,
                procivisResponse: result
            };

        } catch (error) {
            console.error('=== PROCIVIS CREATE PROOF REQUEST ERROR ===');
            console.error('Error details:', error.message);

            // Handle authentication errors
            if (error.message.includes('401') || error.message.includes('Authentication')) {
                console.log('Authentication error detected, clearing token and retrying...');
                this.accessToken = null;

                try {
                    await this.authenticate();
                    return await this.createProofRequest();
                } catch (retryError) {
                    console.error('Retry after authentication also failed:', retryError.message);
                    throw new Error(`Authentication failed: ${retryError.message}`);
                }
            }

            throw error;
        }
    }

    /**
     * Share a proof request and get the QR code URLs
     * @param {string} proofRequestId - Proof request ID to share
     * @returns {Promise<Object>} Share result with URLs for QR code
     */
    async shareProofRequest(proofRequestId) {
        console.log('=== PROCIVIS SHARE PROOF REQUEST START ===');
        console.log('Proof request ID to share:', proofRequestId);

        // Ensure we have a valid token
        if (!this.accessToken) {
            console.log('No access token available, attempting to authenticate...');
            await this.authenticate();
        }

        try {
            // Make API call to share proof request
            const response = await fetch(`${this.baseUrl}/api/proof-request/v1/${proofRequestId}/share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json'
                },
                body: '' // Empty body
            });

            console.log('Procivis share proof request API response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Procivis share proof request API error response:', errorText);
                throw new Error(`Procivis share proof request API error (${response.status}): ${errorText}`);
            }

            const result = await response.json();
            console.log('Proof request shared successfully:', result);

            if (!result.url) {
                throw new Error('Procivis API did not return sharing URLs');
            }

            console.log('=== PROCIVIS SHARE PROOF REQUEST SUCCESS ===');

            return {
                qrCodeUrl: result.url, // URL for mobile wallets (QR code)
                appUrl: result.appUrl, // URL for web browsers
                proofRequestId: proofRequestId,
                shareResponse: result
            };

        } catch (error) {
            console.error('=== PROCIVIS SHARE PROOF REQUEST ERROR ===');
            console.error('Error details:', error.message);

            // Handle authentication errors
            if (error.message.includes('401') || error.message.includes('Authentication')) {
                console.log('Authentication error detected, clearing token and retrying...');
                this.accessToken = null;

                try {
                    await this.authenticate();
                    return await this.shareProofRequest(proofRequestId);
                } catch (retryError) {
                    console.error('Retry after authentication also failed:', retryError.message);
                    throw new Error(`Authentication failed: ${retryError.message}`);
                }
            }

            throw error;
        }
    }

    /**
     * Get proof request status and details
     * @param {string} proofRequestId - Proof request ID
     * @returns {Promise<Object>} Proof request details
     */
    async getProofRequestDetails(proofRequestId) {
        console.log('Getting proof request details for:', proofRequestId);

        // Ensure we have a valid token
        if (!this.accessToken) {
            await this.authenticate();
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/proof-request/v1/${proofRequestId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Procivis get proof request API error (${response.status}): ${errorText}`);
            }

            const result = await response.json();
            console.log('Proof request details retrieved:', result.state);

            return result;

        } catch (error) {
            console.error('Error getting proof request details:', error.message);
            throw error;
        }
    }

    /**
     * Get proof request status (simplified)
     * @param {string} proofRequestId - Proof request ID
     * @returns {Promise<Object>} Status info
     */
    async getProofRequestStatus(proofRequestId) {
        const details = await this.getProofRequestDetails(proofRequestId);

        return {
            state: details.state,
            createdDate: details.createdDate,
            lastModified: details.lastModified,
            completedDate: details.completedDate || null
        };
    }
}

module.exports = ProcivisService;