// Banking Account Management Application - jQuery Version
// Load configuration from config.js
const config = window.BankingConfig || {};
const API_BASE_URL = config.API_BASE_URL || 'http://localhost:3000/api';

// QR Code Modal Data
let currentQRData = null;
let currentQRCanvas = null;

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
        .text(message);

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
 * Mask PAN number for security (show only first and last 4 digits)
 * @param {string} pan - PAN number to mask
 * @returns {string} Masked PAN
 */
function maskPAN(pan) {
    if (!pan || pan.length < 8) return pan;
    const start = pan.substring(0, 4);
    const end = pan.substring(pan.length - 4);
    const middle = '*'.repeat(pan.length - 8);
    return `${start}${middle}${end}`;
}

/**
 * Format ISO date string to readable format
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

/**
 * Set loading state for submit button
 * @param {boolean} isLoading - Whether to show loading state
 */
function setLoadingState(isLoading) {
    const $submitBtn = $('#submitBtn');
    const $submitText = $('#submitText');
    const $submitLoading = $('#submitLoading');

    $submitBtn.prop('disabled', isLoading);

    if (isLoading) {
        $submitText.hide();
        $submitLoading.show();
    } else {
        $submitText.show();
        $submitLoading.hide();
    }
}

// ===============
// API FUNCTIONS
// ===============

/**
 * Fetch all accounts from the API
 * @returns {Promise<Array>} Array of account objects
 */
async function fetchAccounts() {
    try {
        console.log('🔄 Fetching accounts from:', `${API_BASE_URL}/accounts`);

        const response = await $.ajax({
            url: `${API_BASE_URL}/accounts`,
            method: 'GET',
            dataType: 'json',
            timeout: 10000 // 10 second timeout
        });

        console.log('✅ Accounts response:', response);

        if (response.success) {
            console.log('📊 Found accounts:', response.data.length);
            return response.data;
        } else {
            console.error('❌ API returned success=false:', response.error);
            throw new Error(response.error || 'Failed to fetch accounts');
        }
    } catch (error) {
        console.error('❌ Error fetching accounts:', error);

        // More detailed error logging for jQuery ajax errors
        if (error.status) {
            console.error('HTTP Status:', error.status);
            console.error('Response Text:', error.responseText);
            console.error('Status Text:', error.statusText);
        }

        throw new Error(error.responseJSON?.error || error.message || `HTTP ${error.status}: ${error.statusText}` || 'Failed to fetch accounts');
    }
}

/**
 * Create a new account via API
 * @param {Object} accountData - Account data to create
 * @returns {Promise<Object>} Created account object
 */
async function createAccount(accountData) {
    try {
        const response = await $.ajax({
            url: `${API_BASE_URL}/accounts`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(accountData),
            dataType: 'json'
        });

        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.error || 'Failed to create account');
        }
    } catch (error) {
        console.error('Error creating account:', error);
        throw new Error(error.responseJSON?.error || error.message || 'Failed to create account');
    }
}

/**
 * Check server status
 * @returns {Promise<boolean>} True if server is healthy
 */
async function checkServerStatus() {
    try {
        const response = await $.ajax({
            url: `${API_BASE_URL}/status`,
            method: 'GET',
            dataType: 'json'
        });

        if (response.status === 'OK') {
            $('#serverStatus').text('🟢');
            $('#serverDetails').text(`Connected (${response.database.accountsCount} accounts)`);
            return true;
        } else {
            throw new Error('Server not responding properly');
        }
    } catch (error) {
        $('#serverStatus').text('🔴');
        $('#serverDetails').text('Connection failed');
        console.error('Server status check failed:', error);
        return false;
    }
}

// ===============
// UI FUNCTIONS
// ===============

/**
 * Render accounts table with provided data
 * @param {Array} accounts - Array of account objects
 */
function renderAccountsTable(accounts) {
    const $tableBody = $('#accountsTableBody');

    if (!accounts || accounts.length === 0) {
        $tableBody.html(`
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        <h3>No accounts found</h3>
                        <p>Add your first account using the form above.</p>
                    </div>
                </td>
            </tr>
        `);
        $('#totalAccounts').text('0');
        return;
    }

    const tableRows = accounts.map(account => `
        <tr>
            <td>${account.email}</td>
            <td><span class="pan-masked">${maskPAN(account.pan)}</span></td>
            <td>${account.expiryDate}</td>
            <td>${account.cardholderName}</td>
            <td><strong>€${account.balance.toFixed(2)}</strong></td>
            <td>${formatDate(account.createdAt)}</td>
            <td>
                <button class="btn-credential" onclick="issueCredential('${account.id}')" 
                        ${account.credentialId ? 'title="Re-issue credential"' : 'title="Issue new credential"'}>
                    ${account.credentialId ? 'Re-issue VC' : 'Issue VC'}
                </button>
            </td>
        </tr>
    `).join('');

    $tableBody.html(tableRows);
    $('#totalAccounts').text(accounts.length.toString());
}

/**
 * Load and display accounts
 */
async function loadAccounts() {
    try {
        console.log('🚀 Starting to load accounts...');
        hideAlert($('#tableAlert'));

        const accounts = await fetchAccounts();
        console.log('✅ Successfully loaded accounts:', accounts);

        renderAccountsTable(accounts);
        console.log('✅ Accounts table rendered');

    } catch (error) {
        console.error('❌ Failed to load accounts:', error);
        showAlert($('#tableAlert'), `Failed to load accounts: ${error.message}`, 'error');
        renderAccountsTable([]);
    }
}

// ===================
// FORM VALIDATION
// ===================

/**
 * Validate form data before submission
 * @param {Object} formData - Form data to validate
 * @returns {Array} Array of validation error messages
 */
function validateForm(formData) {
    const errors = [];

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
        errors.push('Please enter a valid email address');
    }

    // PAN validation (13-19 digits)
    const panRegex = /^\d{13,19}$/;
    const cleanPAN = formData.pan.replace(/[\s-]/g, '');
    if (!panRegex.test(cleanPAN)) {
        errors.push('Card number must be 13-19 digits');
    }

    // Expiry date validation (MM/YY format)
    const expiryRegex = /^(0[1-9]|1[0-2])\/\d{2}$/;
    if (!expiryRegex.test(formData.expiryDate)) {
        errors.push('Expiry date must be in MM/YY format');
    } else {
        // Check if date is in the future
        const [month, year] = formData.expiryDate.split('/');
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear() % 100;
        const currentMonth = currentDate.getMonth() + 1;

        const expYear = parseInt(year);
        const expMonth = parseInt(month);

        if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
            errors.push('Card expiry date must be in the future');
        }
    }

    // Cardholder name validation
    if (formData.cardholderName.trim().length < 2) {
        errors.push('Cardholder name must be at least 2 characters');
    }

    // CVC validation (3-4 digits)
    const cvcRegex = /^\d{3,4}$/;
    if (!cvcRegex.test(formData.cvc)) {
        errors.push('CVC must be 3-4 digits');
    }

    // Balance validation
    if (isNaN(formData.balance) || formData.balance < 0) {
        errors.push('Balance must be a valid number greater than or equal to 0');
    }

    return errors;
}

// ====================
// CREDENTIAL FUNCTIONS
// ====================

/**
 * Issue a verifiable credential for an account
 * @param {string} accountId - Account ID
 */
async function issueCredential(accountId) {
    try {
        console.log('Issuing credential for account:', accountId);

        // Find the button and show loading state
        const $button = $(`button[onclick="issueCredential('${accountId}')"]`);
        $button.prop('disabled', true).html('<span class="loading"></span> Issuing...');

        const response = await $.ajax({
            url: `${API_BASE_URL}/credentials/issue`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ accountId }),
            dataType: 'json'
        });

        if (response.success) {
            showAlert($('#tableAlert'),
                `Credential issued successfully! ID: ${response.data.credentialId}`,
                'success'
            );

            // Store QR data and show modal
            currentQRData = {
                url: response.data.qrCode.url,
                appUrl: response.data.qrCode.appUrl,
                credentialId: response.data.credentialId
            };

            showQRModal(response.data.qrCode.url);

            // Reload accounts table to show updated credential status
            await loadAccounts();

        } else {
            throw new Error(response.error || 'Failed to issue credential');
        }

    } catch (error) {
        console.error('Error issuing credential:', error);
        const errorMessage = error.responseJSON?.error || error.message || 'Failed to issue credential';
        showAlert($('#tableAlert'), `Failed to issue credential: ${errorMessage}`, 'error');

        // Reset button state
        const $button = $(`button[onclick="issueCredential('${accountId}')"]`);
        $button.prop('disabled', false).html('Issue VC');
    }
}

// ====================
// QR CODE MODAL FUNCTIONS
// ====================

/**
 * Show QR code modal with the credential URL
 * @param {string} qrUrl - URL to encode in QR code
 */
function showQRModal(qrUrl) {
    const $modal = $('#qrModal');
    const $qrDisplay = $('#qrCodeDisplay');

    // Clear previous QR code
    $qrDisplay.empty();

    // Generate QR code with qrcode-generator (simple and works)
    generateQRCode($qrDisplay, qrUrl);

    $modal.show();
}

/**
 * Generate QR code using qrcode-generator library
 * @param {jQuery} $container - Container element
 * @param {string} url - URL to encode
 */
function generateQRCode($container, url) {
    try {
        // Create QR code
        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();

        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 250;
        const moduleCount = qr.getModuleCount();
        const cellSize = size / moduleCount;

        canvas.width = size;
        canvas.height = size;

        // Fill background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);

        // Draw QR modules
        ctx.fillStyle = '#000000';
        for (let row = 0; row < moduleCount; row++) {
            for (let col = 0; col < moduleCount; col++) {
                if (qr.isDark(row, col)) {
                    ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
                }
            }
        }

        // Style and add to container
        $(canvas).css({
            'border-radius': '10px',
            'box-shadow': '0 2px 8px rgba(0,0,0,0.1)'
        });

        $container.append(canvas);
        currentQRCanvas = canvas;

    } catch (error) {
        console.error('QR generation failed:', error);
        // Simple fallback
        $container.html(`
            <div style="color: #333; padding: 20px; text-align: center;">
                <h4>📱 Credential URL</h4>
                <textarea readonly onclick="this.select()" style="
                    width: 100%; height: 80px; font-size: 11px; 
                    padding: 10px; border: 2px solid #ddd; border-radius: 5px;
                ">${url}</textarea>
            </div>
        `);
    }
}

/**
 * Close QR code modal
 */
function closeQRModal() {
    $('#qrModal').hide();
    currentQRData = null;
    currentQRCanvas = null;
}

// Make functions globally accessible
window.closeQRModal = closeQRModal;
window.issueCredential = issueCredential;

// ====================
// JQUERY DOCUMENT READY
// ====================

$(document).ready(function () {
    console.log('Initializing Banking Account Management System...');

    // Initialize application
    async function init() {
        try {
            console.log('🎯 Initializing Banking Account Management System...');

            // Check server status
            console.log('🔍 Checking server status...');
            await checkServerStatus();

            // Load existing accounts
            console.log('📊 Loading existing accounts...');
            await loadAccounts();

            console.log('✅ Application initialized successfully');
        } catch (error) {
            console.error('❌ Error during initialization:', error);
            showAlert($('#tableAlert'), 'Failed to initialize application. Please refresh the page.', 'error');
        }
    }

    // Start initialization
    init();

    // Initialize loading states correctly
    $('#submitLoading').hide();
    $('#submitText').show();

    // Refresh server status every 30 seconds
    setInterval(async () => {
        await checkServerStatus();
    }, config.SERVER_STATUS_CHECK_INTERVAL || 30000);

    // ==================
    // EVENT HANDLERS
    // ==================

    // Handle form submission
    $('#accountForm').on('submit', async function (e) {
        e.preventDefault();

        const formData = {
            email: $('#email').val().trim(),
            pan: $('#pan').val().trim(),
            expiryDate: $('#expiryDate').val().trim(),
            cardholderName: $('#cardholderName').val().trim(),
            balance: parseFloat($('#balance').val()) || 0,
            cvc: $('#cvc').val().trim()
        };

        // Client-side validation
        const validationErrors = validateForm(formData);
        if (validationErrors.length > 0) {
            showAlert($('#formAlert'), validationErrors.join('. '), 'error');
            return;
        }

        hideAlert($('#formAlert'));
        setLoadingState(true);

        try {
            const newAccount = await createAccount(formData);

            showAlert($('#formAlert'),
                `Account created successfully! PIN has been sent to ${newAccount.email}`,
                'success'
            );

            // Reset form
            $('#accountForm')[0].reset();

            // Reload accounts table
            await loadAccounts();

        } catch (error) {
            showAlert($('#formAlert'), error.message, 'error');
        } finally {
            setLoadingState(false);
        }
    });

    // Format expiry date input as user types (MM/YY)
    $('#expiryDate').on('input', function () {
        let value = $(this).val().replace(/\D/g, '');
        if (value.length >= 2) {
            value = value.substring(0, 2) + '/' + value.substring(2, 4);
        }
        $(this).val(value);
    });

    // Format PAN input (remove non-digits)
    $('#pan').on('input', function () {
        $(this).val($(this).val().replace(/\D/g, ''));
    });

    // Format CVC input (remove non-digits, max 4 chars)
    $('#cvc').on('input', function () {
        $(this).val($(this).val().replace(/\D/g, '').substring(0, 4));
    });

    // Close modal when clicking outside
    $('#qrModal').on('click', function (event) {
        if (event.target === this) {
            closeQRModal();
        }
    });

    // Close modal with Escape key
    $(document).on('keydown', function (event) {
        if (event.key === 'Escape') {
            closeQRModal();
        }
    });
});