/**
 * Verify PIN and complete payment
 */
async function verifyPINAndCompletePayment(paymentId, pin) {
    try {
        const response = await $.ajax({
            url: `${API_BASE_URL}/payments/${paymentId}/verify-pin`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ pin: pin }),
            dataType: 'json'
        });

        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.error || 'PIN verification failed');
        }
    } catch (error) {
        console.error('Error verifying PIN:', error);
        throw new Error(error.responseJSON?.error || error.message || 'PIN verification failed');
    }
}

/**
 * Submit PIN for payment completion
 */
async function submitPIN() {
    const pin = $('#pinInput').val().trim();
    const $pinError = $('#pinError');

    // Hide previous errors
    $pinError.attr('hidden', true);

    // Validate PIN
    if (!pin || pin.length !== 6 || !/^\d+$/.test(pin)) {
        $pinError.removeAttr('hidden').text('Please enter a valid 6-digit PIN');
        return;
    }

    if (!currentPayment) {
        $pinError.removeAttr('hidden').text('No active payment found');
        return;
    }

    try {
        console.log('Verifying PIN for payment:', currentPayment.id);

        // Disable PIN input during verification
        $('#pinInput').prop('disabled', true);
        $('.pin-buttons button').prop('disabled', true);

        const result = await verifyPINAndCompletePayment(currentPayment.id, pin);
        console.log('PIN verified and payment completed:', result);

        // Update status to success
        updatePaymentStatusIndicator({
            status: 'COMPLETED',
            result: result
        });

        showAlert($('#paymentAlert'),
            `Payment completed! Transaction ID: ${result.transactionId}`,
            'success'
        );

        // Close modal after 3 seconds
        setTimeout(() => {
            closePaymentQRModal();
            updateMainPaymentStatus(result);
            loadRecentPayments();
        }, 3000);

    } catch (error) {
        console.error('PIN verification failed:', error);

        // Show error in PIN section
        $pinError.removeAttr('hidden').text(error.message);

        // Clear PIN input
        $('#pinInput').val('').focus();

    } finally {
        // Re-enable PIN input
        $('#pinInput').prop('disabled', false);
        $('.pin-buttons button').prop('disabled', false);
    }
}

/**
 * Cancel payment
 */
async function cancelPayment() {
    try {
        if (currentPayment) {
            console.log('Cancelling payment:', currentPayment.id);

            // Update payment status to cancelled (you might want to add this endpoint)
            updatePaymentStatusIndicator({
                status: 'CANCELLED'
            });
        }

        closePaymentQRModal();

    } catch (error) {
        console.error('Error cancelling payment:', error);
        closePaymentQRModal();
    }
}

// Merchant Payment System - jQuery Version
// Load configuration from config.js
const config = window.BankingConfig || {};
const API_BASE_URL = config.API_BASE_URL || 'http://localhost:3000/api';

// Payment tracking
let currentPayment = null;
let paymentStatusInterval = null;

// =================
// UTILITY FUNCTIONS
// =================

/**
 * Show alert message with specified type
 */
function showAlert($alertElement, message, type) {
    $alertElement
        .removeClass('hidden')
        .attr('class', `alert alert-${type}`)
        .text(message);

    if (type === 'success') {
        setTimeout(() => {
            $alertElement.addClass('hidden');
        }, 5000);
    }
}

/**
 * Hide alert element
 */
function hideAlert($alertElement) {
    $alertElement.addClass('hidden');
}

/**
 * Set loading state for payment button
 */
function setPaymentLoadingState(isLoading) {
    const $btn = $('#createPaymentBtn');
    const $text = $('#createPaymentText');
    const $loading = $('#createPaymentLoading');

    $btn.prop('disabled', isLoading);

    if (isLoading) {
        $text.hide();
        $loading.show();
    } else {
        $text.show();
        $loading.hide();
    }
}

// ===============
// API FUNCTIONS
// ===============

/**
 * Create a payment request
 */
async function createPaymentRequest(paymentData) {
    try {
        const response = await $.ajax({
            url: `${API_BASE_URL}/payments/request`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(paymentData),
            dataType: 'json'
        });

        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.error || 'Failed to create payment request');
        }
    } catch (error) {
        console.error('Error creating payment request:', error);
        throw new Error(error.responseJSON?.error || error.message || 'Failed to create payment request');
    }
}

/**
 * Check payment status
 */
async function checkPaymentStatus(paymentId) {
    try {
        const response = await $.ajax({
            url: `${API_BASE_URL}/payments/${paymentId}/status`,
            method: 'GET',
            dataType: 'json'
        });

        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.error || 'Failed to check payment status');
        }
    } catch (error) {
        console.error('Error checking payment status:', error);
        throw new Error(error.responseJSON?.error || error.message || 'Failed to check payment status');
    }
}

/**
 * Process payment
 */
async function processPayment(paymentId) {
    try {
        const response = await $.ajax({
            url: `${API_BASE_URL}/payments/${paymentId}/process`,
            method: 'POST',
            contentType: 'application/json',
            dataType: 'json'
        });

        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.error || 'Failed to process payment');
        }
    } catch (error) {
        console.error('Error processing payment:', error);
        throw new Error(error.responseJSON?.error || error.message || 'Failed to process payment');
    }
}

/**
 * Get all payments (for prototype)
 */
async function getAllPayments() {
    try {
        const response = await $.ajax({
            url: `${API_BASE_URL}/payments/all`,
            method: 'GET',
            dataType: 'json'
        });

        if (response.success) {
            return response.data;
        } else {
            throw new Error(response.error || 'Failed to get all payments');
        }
    } catch (error) {
        console.error('Error getting all payments:', error);
        throw new Error(error.responseJSON?.error || error.message || 'Failed to get all payments');
    }
}

// ===============
// PAYMENT FUNCTIONS
// ===============

/**
 * Create and display payment request
 */
async function handleCreatePayment(paymentData) {
    try {
        console.log('Creating payment request:', paymentData);
        const payment = await createPaymentRequest(paymentData);
        console.log('Payment request created:', payment);

        currentPayment = payment;
        showPaymentQRModal(payment);
        startPaymentStatusPolling(payment.id);
        updatePaymentStatusDisplay(payment);

        showAlert($('#paymentAlert'),
            `Payment request created! Amount: €${payment.amount}`,
            'success'
        );
    } catch (error) {
        console.error('Failed to create payment:', error);
        showAlert($('#paymentAlert'),
            `Failed to create payment: ${error.message}`,
            'error'
        );
    }
}

/**
 * Start polling payment status - VERSIONE OTTIMIZZATA
 */
function startPaymentStatusPolling(paymentId) {
    if (paymentStatusInterval) {
        clearInterval(paymentStatusInterval);
    }

    console.log('Starting payment status polling for:', paymentId);

    paymentStatusInterval = setInterval(async () => {
        try {
            const status = await checkPaymentStatus(paymentId);
            console.log('Payment status update:', status);

            updatePaymentStatusIndicator(status);

            // STOP POLLING when proof is accepted and payment is processing
            if (status.proofState === 'ACCEPTED' && status.status === 'processing') {
                console.log('✅ Proof accepted and payment in processing - STOPPING polling (waiting for PIN)');
                if (paymentStatusInterval) {
                    clearInterval(paymentStatusInterval);
                    paymentStatusInterval = null;
                }
                return; // Exit immediately
            }

            // STOP POLLING when proof is accepted but still pending (transition state)
            if (status.proofState === 'ACCEPTED' && status.status === 'pending') {
                console.log('Proof accepted, calling process endpoint to transition to processing...');
                try {
                    await processPayment(paymentId);

                    // STOP POLLING after successful transition
                    console.log('✅ Proof accepted and processed - STOPPING polling for efficiency');
                    if (paymentStatusInterval) {
                        clearInterval(paymentStatusInterval);
                        paymentStatusInterval = null;
                    }
                } catch (processError) {
                    console.error('Failed to process payment:', processError);
                    // Continue polling in case of process error
                }
                return; // Exit immediately
            }

            // STOP POLLING if payment reaches any final state
            if (['completed', 'failed', 'expired', 'cancelled'].includes(status.status)) {
                console.log('Payment reached final state:', status.status, '- STOPPING polling');
                if (paymentStatusInterval) {
                    clearInterval(paymentStatusInterval);
                    paymentStatusInterval = null;
                }
                return; // Exit immediately
            }

            // Continue polling only for truly pending states
            console.log('Payment still pending, continuing to poll...');

        } catch (error) {
            console.error('Status polling error:', error);
            // Don't stop polling on errors, just log them
        }
    }, 3000); // Poll every 3 seconds only when necessary
}

/**
 * Update payment status display
 */
function updatePaymentStatusDisplay(payment) {
    const $statusContainer = $('#paymentStatus');

    $statusContainer.html(`
        <div class="payment-info-card">
            <h3>Payment Request Active</h3>
            <div class="payment-details">
                <div class="detail-row">
                    <span class="label">Amount:</span>
                    <span class="value">€${payment.amount.toFixed(2)}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Payment ID:</span>
                    <span class="value">${payment.id}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Status:</span>
                    <span class="value status-pending">Waiting for customer</span>
                </div>
                <div class="detail-row">
                    <span class="label">Created:</span>
                    <span class="value">${new Date(payment.createdAt).toLocaleString()}</span>
                </div>
            </div>
        </div>
    `);
}

/**
 * Update main payment status display after completion
 */
function updateMainPaymentStatus(result) {
    const $statusContainer = $('#paymentStatus');

    $statusContainer.html(`
        <div class="payment-info-card success">
            <h3>✅ Payment Completed</h3>
            <div class="payment-details">
                <div class="detail-row">
                    <span class="label">Amount:</span>
                    <span class="value">€${result.amount.toFixed(2)}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Transaction ID:</span>
                    <span class="value">${result.transactionId}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Customer:</span>
                    <span class="value">${result.cardholderName}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Completed:</span>
                    <span class="value">${new Date(result.timestamp).toLocaleString()}</span>
                </div>
            </div>
        </div>
    `);
}

/**
 * Load and display all recent payments (prototype mode)
 */
async function loadRecentPayments() {
    try {
        console.log('Loading all recent payments for prototype view');

        const data = await getAllPayments();
        console.log('All payments data received:', data);
        console.log('Completed payments:', data.completedPayments);

        displayRecentPayments(data.completedPayments || []);

    } catch (error) {
        console.error('Failed to load recent payments:', error);

        $('#paymentsTableContainer').html(`
            <div class="empty-state error">
                <h3>⚠️ Error loading payments</h3>
                <p>${error.message}</p>
                <button class="btn" onclick="loadRecentPayments()">🔄 Retry</button>
            </div>
        `);
    }
}

/**
 * Load payments with filter option
 */
async function loadPaymentsWithFilter(onlySuccessful = false) {
    try {
        console.log('Loading payments with filter - onlySuccessful:', onlySuccessful);

        const response = await $.ajax({
            url: `${API_BASE_URL}/payments/all?onlySuccessful=${onlySuccessful}`,
            method: 'GET',
            dataType: 'json'
        });

        if (response.success) {
            displayRecentPayments(response.data.completedPayments || [], onlySuccessful);
            return response.data;
        } else {
            throw new Error(response.error || 'Failed to get filtered payments');
        }
    } catch (error) {
        console.error('Error getting filtered payments:', error);
        throw new Error(error.responseJSON?.error || error.message || 'Failed to get filtered payments');
    }
}

/**
 * Display recent payments in the table
 */
function displayRecentPayments(payments, onlySuccessful = false) {
    const $container = $('#paymentsTableContainer');

    console.log('displayRecentPayments called with:', payments);
    console.log('Number of payments to display:', payments ? payments.length : 0);
    console.log('Show only successful:', onlySuccessful);

    if (!payments || payments.length === 0) {
        console.log('No payments to display, showing empty state');
        $container.html(`
            <div class="empty-state">
                <h3>No payments found</h3>
                <p>${onlySuccessful ? 'No successful payments yet.' : 'Payment history will appear here.'}</p>
            </div>
        `);
        return;
    }

    try {
        const sortedPayments = payments.sort((a, b) =>
            new Date(b.timestamp) - new Date(a.timestamp)
        );

        console.log('Sorted payments:', sortedPayments);

        // Create filter toggle
        const filterToggle = `
            <div class="payments-filter" style="margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                    <input type="checkbox" id="onlySuccessfulFilter" ${onlySuccessful ? 'checked' : ''} 
                           onchange="togglePaymentFilter(this.checked)">
                    <span>Show only successful payments</span>
                </label>
                <span style="color: #6c757d; font-size: 0.9em;">
                    (${payments.length} ${onlySuccessful ? 'successful' : 'total'} payments)
                </span>
            </div>
        `;

        const paymentsHtml = `
            ${filterToggle}
            <div class="table-container">
                <table class="payments-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Merchant</th>
                            <th>Customer</th>
                            <th>Description</th>
                            <th>Transaction ID</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedPayments.map(payment => {
            console.log('Processing payment:', payment);
            const date = new Date(payment.timestamp).toLocaleDateString();
            const amount = payment.amount ? payment.amount.toFixed(2) : '0.00';
            const merchantId = payment.merchantId || 'N/A';
            const customerName = payment.cardholderName || 'N/A';
            const description = payment.description || '-';
            const transactionId = payment.id || 'N/A';
            const status = payment.status || 'unknown';

            // Status badge with colors
            let statusBadge = '';
            switch (status) {
                case 'completed':
                    statusBadge = `<span class="status-badge completed">✅ COMPLETED</span>`;
                    break;
                case 'failed_pin':
                    statusBadge = `<span class="status-badge failed">❌ PIN FAILED</span>`;
                    break;
                case 'failed_expired':
                    statusBadge = `<span class="status-badge failed">⏰ EXPIRED</span>`;
                    break;
                case 'failed_insufficient_funds':
                    statusBadge = `<span class="status-badge failed">💳 NO FUNDS</span>`;
                    break;
                case 'failed_invalid_credential':
                    statusBadge = `<span class="status-badge failed">🚫 INVALID CRED</span>`;
                    break;
                case 'failed_invalid_state':
                    statusBadge = `<span class="status-badge failed">⚠️ WRONG STATE</span>`;
                    break;
                default:
                    statusBadge = `<span class="status-badge pending">${status.toUpperCase()}</span>`;
            }

            return `
                                <tr>
                                    <td>${date}</td>
                                    <td class="amount">€${amount}</td>
                                    <td class="merchant-id">${merchantId}</td>
                                    <td>${customerName}</td>
                                    <td>${description}</td>
                                    <td class="transaction-id">${transactionId}</td>
                                    <td>${statusBadge}</td>
                                </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>
            </div>
            
            <div class="payments-summary">
                <p><strong>Total payments:</strong> ${payments.length}</p>
                <p><strong>Total amount:</strong> €${payments.reduce((sum, p) => sum + (p.amount || 0), 0).toFixed(2)}</p>
                <p><strong>Success rate:</strong> ${payments.length > 0 ? Math.round((payments.filter(p => p.status === 'completed').length / payments.length) * 100) : 0}%</p>
            </div>
        `;

        console.log('Setting HTML for payments table');
        $container.html(paymentsHtml);

    } catch (error) {
        console.error('Error in displayRecentPayments:', error);
        $container.html(`
            <div class="empty-state error">
                <h3>⚠️ Error displaying payments</h3>
                <p>${error.message}</p>
            </div>
        `);
    }
}

/**
 * Update payment status indicator in modal - VERSIONE CON HIDDEN ATTRIBUTE
 */
function updatePaymentStatusIndicator(status) {
    const $indicator = $('#paymentStatusIndicator');
    const $dot = $indicator.find('.status-dot');
    const $text = $indicator.find('.status-text');
    const $pinSection = $('#pinInputSection');
    const $qrContainer = $('.qr-code-container');

    if (!$indicator.length) {
        console.warn('Status indicator not found');
        return;
    }

    $dot.removeClass('pending verifying processing success error');

    const apiStatus = status.status || 'pending';
    const proofState = status.proofState;

    console.log('Updating status indicator:', { apiStatus, proofState });

    switch (apiStatus.toLowerCase()) {
        case 'pending':
            if (proofState === 'ACCEPTED') {
                // Credential verificata! Nascondere QR e mostrare PIN
                $dot.addClass('processing');
                $text.text('✅ Credential verified! Transitioning to PIN entry...');

                console.log('🔐 Credential verified - hiding QR, preparing PIN section');
                $qrContainer.hide();
                $pinSection.attr('hidden', true); // Nascondi temporaneamente durante transizione
            } else {
                // Ancora in attesa di scan
                $dot.addClass('pending');
                $text.text('📱 Waiting for customer to scan QR code...');

                console.log('⏳ Still waiting for credential verification');
                $qrContainer.show();
                $pinSection.attr('hidden', true);
            }
            break;

        case 'processing':
            // Credential verificata E payment processato - MOSTRA PIN
            $dot.addClass('processing');
            $text.text('🔐 Customer verified! Please enter PIN to complete payment.');

            console.log('✅ CREDENTIAL VERIFIED - Showing PIN input section');

            // NASCONDI QR CODE e MOSTRA PIN INPUT
            $qrContainer.hide();
            $pinSection.removeAttr('hidden');
            $('#pinInput').focus();

            console.log('🎯 PIN section now visible, QR code hidden');
            break;

        case 'completed':
            $dot.addClass('success');
            $text.text('✅ Payment completed successfully!');

            // Nascondi tutto - payment completato
            console.log('🎉 Payment completed - hiding all input sections');
            $qrContainer.hide();
            $pinSection.attr('hidden', true);
            break;

        case 'failed':
            $dot.addClass('error');
            $text.text(`❌ Payment failed: ${status.error || 'Unknown error'}`);

            console.log('❌ Payment failed - hiding input sections');
            $qrContainer.hide();
            $pinSection.attr('hidden', true);

            setTimeout(() => {
                closePaymentQRModal();
            }, 3000);
            break;

        case 'expired':
            $dot.addClass('error');
            $text.text('⏰ Payment request expired');

            console.log('⏰ Payment expired - hiding input sections');
            $qrContainer.hide();
            $pinSection.attr('hidden', true);

            setTimeout(() => {
                closePaymentQRModal();
            }, 3000);
            break;

        case 'cancelled':
            $dot.addClass('error');
            $text.text('❌ Payment cancelled');

            console.log('❌ Payment cancelled - hiding input sections');
            $qrContainer.hide();
            $pinSection.attr('hidden', true);
            break;

        default:
            // Fallback - mostra QR, nascondi PIN
            $dot.addClass('pending');
            $text.text('📱 Waiting for customer...');

            console.log('🔄 Fallback state - showing QR, hiding PIN');
            $qrContainer.show();
            $pinSection.attr('hidden', true);
    }
}

// ===============
// QR CODE FUNCTIONS
// ===============

/**
 * Show payment QR code modal
 */
function showPaymentQRModal(payment) {
    const $modal = $('#paymentQRModal');

    $('#modalPaymentAmount').text(payment.amount.toFixed(2));
    $('#modalPaymentDescription').text(payment.description || 'Payment request');

    const qrUrl = payment.qrCode?.url || payment.paymentUrl;
    console.log('Generating QR code for URL:', qrUrl);

    if (qrUrl) {
        generatePaymentQRCode(qrUrl);
    } else {
        console.error('No QR URL available:', payment);
    }

    console.log('🔄 Initializing modal - showing QR, hiding PIN');

    // STATO INIZIALE: QR visibile, PIN nascosto
    $('.qr-code-container').show();
    $('#pinInputSection').attr('hidden', true);
    $('#pinError').attr('hidden', true);

    // Reset PIN input
    $('#pinInput').val('');

    // Stato iniziale sempre pending
    updatePaymentStatusIndicator({ status: 'pending' });

    console.log('✅ Modal initialized in correct state');
    $modal.show();
}

/**
 * Generate QR code for payment
 */
function generatePaymentQRCode(paymentUrl) {
    const $qrDisplay = $('#paymentQRCodeDisplay');
    $qrDisplay.empty();

    try {
        const qr = qrcode(0, 'M');
        qr.addData(paymentUrl);
        qr.make();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 250;
        const moduleCount = qr.getModuleCount();
        const cellSize = size / moduleCount;

        canvas.width = size;
        canvas.height = size;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);

        ctx.fillStyle = '#000000';
        for (let row = 0; row < moduleCount; row++) {
            for (let col = 0; col < moduleCount; col++) {
                if (qr.isDark(row, col)) {
                    ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
                }
            }
        }

        $(canvas).css({
            'border-radius': '10px',
            'box-shadow': '0 2px 8px rgba(0,0,0,0.1)'
        });

        $qrDisplay.append(canvas);

        console.log('QR code generated successfully');

    } catch (error) {
        console.error('QR generation failed:', error);
        $qrDisplay.html(`
            <div style="color: #333; padding: 20px; text-align: center;">
                <h4>📱 Payment URL</h4>
                <textarea readonly onclick="this.select()" style="
                    width: 100%; height: 80px; font-size: 11px; 
                    padding: 10px; border: 2px solid #ddd; border-radius: 5px;
                ">${paymentUrl}</textarea>
            </div>
        `);
    }
}

/**
 * Close payment QR modal
 */
function closePaymentQRModal() {
    $('#paymentQRModal').hide();

    if (paymentStatusInterval) {
        clearInterval(paymentStatusInterval);
        paymentStatusInterval = null;
        console.log('Payment status polling stopped');
    }
}

/**
 * Toggle payment filter between all and successful only
 */
async function togglePaymentFilter(onlySuccessful) {
    try {
        console.log('Toggling payment filter to:', onlySuccessful ? 'successful only' : 'all payments');
        await loadPaymentsWithFilter(onlySuccessful);
    } catch (error) {
        console.error('Error toggling payment filter:', error);
        showAlert($('#paymentAlert'), `Failed to filter payments: ${error.message}`, 'error');
    }
}

// Make functions globally accessible
window.closePaymentQRModal = closePaymentQRModal;
window.loadRecentPayments = loadRecentPayments;
window.submitPIN = submitPIN;
window.cancelPayment = cancelPayment;
window.togglePaymentFilter = togglePaymentFilter;

// ====================
// JQUERY DOCUMENT READY
// ====================

$(document).ready(function () {
    console.log('Merchant Payment System initialized');

    // Handle payment form submission
    $('#paymentForm').on('submit', async function (e) {
        e.preventDefault();

        const paymentData = {
            amount: parseFloat($('#amount').val()),
            description: $('#description').val().trim(),
            merchantId: $('#merchantId').val().trim()
        };

        if (isNaN(paymentData.amount) || paymentData.amount <= 0) {
            showAlert($('#paymentAlert'), 'Please enter a valid payment amount', 'error');
            return;
        }

        hideAlert($('#paymentAlert'));
        setPaymentLoadingState(true);

        try {
            await handleCreatePayment(paymentData);
        } finally {
            setPaymentLoadingState(false);
        }
    });

    // Close modal when clicking outside
    $('#paymentQRModal').on('click', function (event) {
        if (event.target === this) {
            closePaymentQRModal();
        }
    });

    // Close modal with Escape key
    $(document).on('keydown', function (event) {
        if (event.key === 'Escape') {
            closePaymentQRModal();
        }
    });

    console.log('API Base URL:', API_BASE_URL);

    // Load recent payments on page load
    setTimeout(() => {
        console.log('Loading recent payments after page initialization...');
        loadRecentPayments();
    }, 500);

    // Add a refresh button
    setTimeout(() => {
        const $paymentsSection = $('.accounts-section h2');
        if ($paymentsSection.length) {
            $paymentsSection.append(' <button class="btn" onclick="loadRecentPayments()" style="margin-left: 10px; padding: 5px 10px; font-size: 0.8em;">🔄 Refresh</button>');
        }
    }, 1000);

    // Add Enter key support for PIN input
    $(document).on('keypress', '#pinInput', function (e) {
        if (e.which === 13) { // Enter key
            submitPIN();
        }
    });

    // Format PIN input (digits only) and hide errors on input
    $(document).on('input', '#pinInput', function () {
        // Hide PIN error as soon as user starts typing
        $('#pinError').attr('hidden', true);

        // Keep only digits
        let value = $(this).val().replace(/\D/g, ''); // Remove non-digits
        $(this).val(value);
    });
});