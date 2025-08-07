function setupErrorHandling(app) {
    console.log('Setting up error handling...');

    // 404 handler
    app.use('*', (req, res) => {
        console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
        res.status(404).json({
            error: 'Route not found',
            method: req.method,
            path: req.originalUrl,
            timestamp: new Date().toISOString()
        });
    });

    // Global error handler
    app.use((err, req, res, next) => {
        console.error('❌ Global error handler triggered:');
        console.error('Error message:', err.message);
        console.error('Error stack:', err.stack);
        console.error('Request:', req.method, req.path);

        const isDevelopment = process.env.NODE_ENV !== 'production';

        res.status(err.status || 500).json({
            error: isDevelopment ? err.message : 'Internal server error',
            timestamp: new Date().toISOString(),
            ...(isDevelopment && {
                stack: err.stack,
                path: req.path,
                method: req.method
            })
        });
    });

    console.log('✅ Error handling setup complete');
}

module.exports = {
    setupErrorHandling
};