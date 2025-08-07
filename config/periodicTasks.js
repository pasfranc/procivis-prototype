function setupPeriodicTasks(paymentService) {
    console.log('Setting up periodic tasks...');

    // Cleanup expired payments every hour
    const cleanupInterval = setInterval(async () => {
        try {
            console.log('🧹 Running periodic payment cleanup...');
            const expiredCount = await paymentService.expireOldPaymentRequests();
            const cleanedCount = await paymentService.cleanupExpiredRequests();

            if (expiredCount > 0 || cleanedCount > 0) {
                console.log(`✅ Cleanup complete: ${expiredCount} expired, ${cleanedCount} cleaned`);
            }
        } catch (error) {
            console.error('❌ Periodic cleanup failed:', error.message);
        }
    }, 60 * 60 * 1000); // Every hour

    // Graceful shutdown cleanup
    process.on('SIGTERM', () => {
        console.log('🛑 SIGTERM received, cleaning up...');
        clearInterval(cleanupInterval);
        process.exit(0);
    });

    process.on('SIGINT', () => {
        console.log('🛑 SIGINT received, cleaning up...');
        clearInterval(cleanupInterval);
        process.exit(0);
    });

    console.log('✅ Periodic tasks setup complete');
}

module.exports = {
    setupPeriodicTasks
};