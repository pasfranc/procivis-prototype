const express = require('express');
const path = require('path');

function setupMiddleware(app) {
    console.log('Setting up middleware...');

    // Serve static files from public/bank directory under /bank path
    app.use('/bank', express.static(path.join(__dirname, '../public/bank')));

    // Serve static files from public/merchant directory under /merchant path
    app.use('/merchant', express.static(path.join(__dirname, '../public/merchant')));

    // Serve shared assets globally for both bank and merchant
    app.use('/css', express.static(path.join(__dirname, '../public/css')));
    app.use('/js', express.static(path.join(__dirname, '../public/js')));

    // Parse JSON and URL-encoded data
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // CORS middleware for frontend
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

        if (req.method === 'OPTIONS') {
            res.sendStatus(200);
        } else {
            next();
        }
    });

    // Request logging middleware
    app.use((req, res, next) => {
        const timestamp = new Date().toISOString();
        const method = req.method;
        const path = req.path;
        const ip = req.ip || req.connection.remoteAddress;

        console.log(`${timestamp} - ${method} ${path} - IP: ${ip}`);
        next();
    });

    console.log('✅ Middleware setup complete');
}

module.exports = {
    setupMiddleware
};