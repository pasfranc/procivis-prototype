// Credential Suspension Page - jQuery Version
// Load configuration from config.js
const config = window.BankingConfig || {};
const API_BASE_URL = config.API_BASE_URL || 'http://localhost:3000/api';

// Global variables
let credentialId = null;
let accountId = null;

// =================
// UTILITY FUNCTIONS  
// =================

/**
 * Show alert message with specified type
 * @param {jQuery} $alertElement - Alert element to show
 * @param {string} message - Message to display
 * @param {string} type - Alert type (success, error, info)
 */
function showAlert($alertElement, message, type) {
    $alertElement
        .show()
        .attr('class', `alert alert-${type}`)
        .html(message);

    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            $alertElement.hide();
        }, 5000);
    }
}

/**
 * Hide alert element
 * @param {jQuery} $alertElement - Alert element to hide
 */
function hideAlert($alertElement) {
    $alertElement.hide();
}

/**
 * Set loading state for suspend button
 * @param {boolean} isLoading - Whether to show loading state
 */
function setLoadingState(isLoading) {
    const $suspendBtn = $('#suspendBtn');
    const $suspendText = $('#suspendText');
    const $suspendLoading = $('#suspendLoading');

    $suspendBtn.prop('disabled', isLoading);

    if (isLoading) {
        $suspendText.hide();
        $suspendLoading.show();
    } else {
        $suspendText.show();
        $suspendLoading.hide();
    }
}

/**
 * Update status display
 * @param {string} status - Status title
 * @param {string} message - Status message
 * @param {string} type - Status type (info, success, error)
 */
function updateStatusDisplay(status, message, type = 'info') {
    const $statusContainer = $('#statusContainer');

    const statusHtml = `
        <div class="payment-info-card ${type === 'success' ? 'success' : ''}">
            <h3>${status}</h3>
            <div class="payment-details">
                <p>${message}</p>
            </div>
        </div>
    `;

    $statusContainer.html(statusHtml);
}

// =================
// API FUNCTIONS
// =================

/**
 * Suspend credential via API
 * @param {string} credentialId - Credential ID to suspend
 * @param {string} accountId - Account ID
 * @returns {Promise<Object>} API response
 */
async function suspendCredentialAPI(credentialId, accountId) {
    try {
        const response = await $.ajax({
            url: `${API_BASE_URL}/security/suspend-credential`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                credentialId: credentialId,
                accountId: accountId
            }),
            dataType: 'json',
            timeout: 10000 // 10 second timeout
        });

        if (response.success) {
            return response;
        } else {
            throw new Error(response.error || 'Failed to suspend credential');
        }
    } catch (error) {
        console.error('Error calling suspend credential API:', error);
        throw new Error(error.responseJSON?.error || error.message || 'Failed to suspend credential');
    }
}

// =================
// MAIN FUNCTIONS
// =================

/**
 * Initialize page with URL parameters
 */
function initializePage() {
    console.log('Initializing credential suspension page...');

    const urlParams = new URLSearchParams(window.location.search);
    credentialId = urlParams.get('credentialId');
    accountId = urlParams.get('accountId');

    console.log('URL parameters:', { credentialId, accountId });

    if (!credentialId || !accountId) {
        console.error('Missing required URL parameters');

        showAlert($('#securityAlert'),
            '<strong>❌ Invalid Link:</strong> This suspension link is invalid or expired. Please contact customer service.',
            'error'
        );

        updateStatusDisplay(
            '❌ Invalid Request',
            'This suspension link is invalid or expired. Please contact customer service for assistance.',
            'error'
        );

        $('#suspendBtn').prop('disabled', true);
        $('#cancelBtn').text('Return to Banking').attr('onclick', 'window.location.href="/bank"');
        return false;
    }

    // Display account info
    $('#displayCredentialId').text(credentialId);
    $('#displayAccountId').text(accountId);

    console.log('Page initialized successfully');
    return true;
}

/**
 * Suspend credential
 */
async function suspendCredential() {
    try {
        console.log('Starting credential suspension process...');

        hideAlert($('#securityAlert'));
        setLoadingState(true);
        updateStatusDisplay('🔄 Processing', 'Suspending your credential for security...', 'info');

        // Disable cancel button during processing
        $('#cancelBtn').prop('disabled', true);

        const response = await suspendCredentialAPI(credentialId, accountId);

        console.log('Credential suspended successfully:', response);

        const suspendedUntil = new Date(response.data.suspendedUntil).toLocaleDateString();

        showAlert($('#securityAlert'),
            `<strong>✅ Success:</strong> Your credential has been suspended until ${suspendedUntil}. You will receive a confirmation email shortly.`,
            'success'
        );

        updateStatusDisplay(
            '✅ Credential Suspended Successfully',
            `Your credential is now suspended for security until ${suspendedUntil}. This window will redirect to banking dashboard in 5 seconds.`,
            'success'
        );

        // Hide suspend button, update cancel button
        $('#suspendBtn').hide();
        $('#cancelBtn').text('Return to Banking Dashboard').attr('onclick', 'window.location.href="/bank"').prop('disabled', false);

        // Auto-redirect after 5 seconds
        setTimeout(() => {
            console.log('Auto-redirecting to banking dashboard');
            window.location.href = '/bank';
        }, 5000);

    } catch (error) {
        console.error('Error suspending credential:', error);

        const errorMessage = error.message || 'Failed to suspend credential';

        showAlert($('#securityAlert'),
            `<strong>❌ Error:</strong> ${errorMessage}. Please try again or contact customer service.`,
            'error'
        );

        updateStatusDisplay(
            '❌ Suspension Failed',
            `Error: ${errorMessage}. Please try again or contact customer service for assistance.`,
            'error'
        );

    } finally {
        setLoadingState(false);
        $('#cancelBtn').prop('disabled', false);
    }
}

/**
 * Cancel action and return to banking
 */
function cancelAction() {
    if (confirm('Are you sure you want to cancel this security action?')) {
        console.log('User cancelled suspension action');
        window.location.href = '/bank';
    }
}

// Make functions globally accessible
window.suspendCredential = suspendCredential;
window.cancelAction = cancelAction;

// =================
// JQUERY DOCUMENT READY
// =================

$(document).ready(function () {
    console.log('Credential Suspension Page - jQuery Version initialized');

    // Initialize page
    const initialized = initializePage();

    if (initialized) {
        // Setup keyboard shortcuts
        $(document).on('keydown', function (event) {
            if (event.key === 'Escape') {
                cancelAction();
            }
        });

        console.log('Page setup complete - ready for user interaction');
    } else {
        console.log('Page initialization failed - limited functionality');
    }
});