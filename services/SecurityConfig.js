class SecurityConfig {
    constructor() {
        // Load security settings from environment variables
        this.maxPinFailuresBeforeRevoke = parseInt(process.env.MAX_PIN_FAILURES_BEFORE_REVOKE) || 5;
        this.maxPinFailuresBeforeAlert = parseInt(process.env.MAX_PIN_FAILURES_BEFORE_ALERT) || 2;

        // Validate configuration
        this.validateConfiguration();
    }

    /**
     * Validate security configuration values
     */
    validateConfiguration() {
        if (this.maxPinFailuresBeforeRevoke < 1) {
            console.warn('⚠️ MAX_PIN_FAILURES_BEFORE_REVOKE must be at least 1, defaulting to 5');
            this.maxPinFailuresBeforeRevoke = 5;
        }

        if (this.maxPinFailuresBeforeAlert < 1) {
            console.warn('⚠️ MAX_PIN_FAILURES_BEFORE_ALERT must be at least 1, defaulting to 2');
            this.maxPinFailuresBeforeAlert = 2;
        }

        if (this.maxPinFailuresBeforeAlert >= this.maxPinFailuresBeforeRevoke) {
            console.warn('⚠️ MAX_PIN_FAILURES_BEFORE_ALERT should be less than MAX_PIN_FAILURES_BEFORE_REVOKE');
            console.warn('⚠️ Adjusting alert threshold to revoke threshold - 1');
            this.maxPinFailuresBeforeAlert = Math.max(1, this.maxPinFailuresBeforeRevoke - 1);
        }

        console.log('🔐 Security configuration loaded:');
        console.log(`   Alert threshold: ${this.maxPinFailuresBeforeAlert} failures`);
        console.log(`   Revoke threshold: ${this.maxPinFailuresBeforeRevoke} failures`);
    }

    /**
     * Get maximum PIN failures before sending security alert
     * @returns {number} Number of failures before alert
     */
    getAlertThreshold() {
        return this.maxPinFailuresBeforeAlert;
    }

    /**
     * Get maximum PIN failures before credential revocation
     * @returns {number} Number of failures before revocation
     */
    getRevokeThreshold() {
        return this.maxPinFailuresBeforeRevoke;
    }

    /**
     * Check if consecutive failures should trigger security alert
     * @param {number} consecutiveFailures - Current consecutive failures
     * @returns {boolean} True if alert should be sent
     */
    shouldTriggerAlert(consecutiveFailures) {
        return consecutiveFailures >= this.maxPinFailuresBeforeAlert;
    }

    /**
     * Check if consecutive failures should trigger credential revocation
     * @param {number} consecutiveFailures - Current consecutive failures
     * @returns {boolean} True if credential should be revoked
     */
    shouldTriggerRevocation(consecutiveFailures) {
        return consecutiveFailures >= this.maxPinFailuresBeforeRevoke;
    }

    /**
     * Get security risk level based on consecutive failures
     * @param {number} consecutiveFailures - Current consecutive failures
     * @returns {string} Risk level: LOW, MEDIUM, HIGH, CRITICAL
     */
    getRiskLevel(consecutiveFailures) {
        if (consecutiveFailures >= this.maxPinFailuresBeforeRevoke) {
            return 'CRITICAL';
        } else if (consecutiveFailures >= this.maxPinFailuresBeforeAlert) {
            return 'HIGH';
        } else if (consecutiveFailures >= Math.ceil(this.maxPinFailuresBeforeAlert / 2)) {
            return 'MEDIUM';
        } else {
            return 'LOW';
        }
    }

    /**
     * Get human-readable security status message
     * @param {number} consecutiveFailures - Current consecutive failures
     * @returns {Object} Status object with level, message, and action
     */
    getSecurityStatus(consecutiveFailures) {
        const riskLevel = this.getRiskLevel(consecutiveFailures);

        const statusMap = {
            'LOW': {
                level: 'LOW',
                message: 'Account security normal',
                action: 'none',
                emoji: '✅'
            },
            'MEDIUM': {
                level: 'MEDIUM',
                message: `${consecutiveFailures} consecutive PIN failures detected`,
                action: 'monitor',
                emoji: '⚠️'
            },
            'HIGH': {
                level: 'HIGH',
                message: `${consecutiveFailures} consecutive PIN failures - security alert sent`,
                action: 'alert_sent',
                emoji: '🚨'
            },
            'CRITICAL': {
                level: 'CRITICAL',
                message: `${consecutiveFailures} consecutive PIN failures - credential revoked`,
                action: 'credential_revoked',
                emoji: '🔒'
            }
        };

        return statusMap[riskLevel];
    }

    /**
     * Get all security configuration for status reporting
     * @returns {Object} Complete security configuration
     */
    getConfiguration() {
        return {
            alertThreshold: this.maxPinFailuresBeforeAlert,
            revokeThreshold: this.maxPinFailuresBeforeRevoke,
            validationStatus: 'configured',
            source: 'environment_variables'
        };
    }

    /**
     * Get security thresholds as percentages (useful for UI)
     * @returns {Object} Percentage thresholds
     */
    getThresholdPercentages() {
        const total = this.maxPinFailuresBeforeRevoke;
        return {
            alertPercentage: Math.round((this.maxPinFailuresBeforeAlert / total) * 100),
            revokePercentage: 100,
            safeZonePercentage: Math.round((this.maxPinFailuresBeforeAlert - 1) / total * 100)
        };
    }
}

module.exports = SecurityConfig;