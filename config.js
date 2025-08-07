// Frontend Configuration
// This file contains all the configuration that can be customized

window.BankingConfig = {
    // API Configuration
    API_BASE_URL: 'http://localhost:3000/api',

    // Server configuration 
    SERVER_PORT: 3000,

    // UI Configuration
    APP_NAME: 'Banking Account Management',
    APP_DESCRIPTION: 'Manage customer accounts securely and efficiently',

    // Timeouts and intervals
    SERVER_STATUS_CHECK_INTERVAL: 30000, // 30 seconds
    API_TIMEOUT: 10000, // 10 seconds
    SUCCESS_MESSAGE_AUTO_HIDE_DELAY: 5000, // 5 seconds

    // QR Code Configuration
    QR_CODE_SIZE: 250,
    QR_CODE_ERROR_CORRECTION: 'M',
    QR_CODE_MARGIN: 2,

    // Validation rules
    VALIDATION: {
        PAN_MIN_LENGTH: 13,
        PAN_MAX_LENGTH: 19,
        CARDHOLDER_NAME_MIN_LENGTH: 2,
        MIN_BALANCE: 0
    },

    // Display formats
    CURRENCY_SYMBOL: '€',
    DATE_FORMAT: {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    },

    // Development flags
    DEBUG_MODE: false,
    ENABLE_CONSOLE_LOGS: true
};