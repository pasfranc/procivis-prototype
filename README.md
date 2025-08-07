# 🏦 Banking System with Verifiable Credentials

A complete banking system prototype integrating traditional payment processing with **verifiable credentials** via Procivis One API.

## 🌟 Features

- **🏦 Account Management**: Registration, PIN generation, encrypted card data
- **🔐 Verifiable Credentials**: Procivis One integration with QR codes
- **💳 Secure Payments**: Dual-factor auth (credential + PIN) 
- **🛡️ Advanced Security**: Configurable thresholds, auto-revocation, email alerts
- **📧 Email Notifications**: Professional HTML templates for all events

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ 
- SMTP server for emails (Gmail app password recommended)
- Procivis One API credentials

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/pasfranc/procivis-prototype.git
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your settings:
   ```bash
   # SMTP Configuration (required for emails)
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   FROM_EMAIL=your-email@gmail.com
   FROM_NAME="Banking System"

   # Security Configuration
   MAX_PIN_FAILURES_BEFORE_REVOKE=5
   MAX_PIN_FAILURES_BEFORE_ALERT=2

   # Encryption (generate a secure 32+ character salt)
   ENCRYPTION_SALT=your-secure-salt-32-chars-minimum

   # Procivis One API (optional)
   PROCIVIS_CLIENT_SECRET=your-procivis-secret
   PROCIVIS_BASE_URL=https://api.trial.procivis-one.com
   # ... other Procivis settings
   ```

4. **Start the application**
   ```bash
   # Development (with auto-reload)
   npm run dev

   # Production
   npm start
   ```

5. **Access the interfaces**
   - **Banking Interface**: http://localhost:3000/bank
   - **Merchant Interface**: http://localhost:3000/merchant
   - **API Status**: http://localhost:3000/api/status
   - **Health Check**: http://localhost:3000/health

## 💡 Usage

### Create Bank Accounts
1. Go to `/bank`
2. Fill the account creation form
3. System generates PIN and sends email
4. Issue verifiable credentials with QR codes

### Process Payments
1. Go to `/merchant` 
2. Create payment request
3. Customer scans QR with wallet app
4. Verify credential → Enter PIN → Complete payment

### Security Features
- Automatic email alerts after 2 failed PIN attempts
- Automatic credential revocation after 5 consecutive failures
- Manual credential suspension via email links

## 🏗️ Architecture

```
├── server.js                 # Application entry point
├── services/                 # Business logic
│   ├── AccountService.js     # Account management
│   ├── PaymentService.js     # Transaction handling
│   ├── ProcivisService.js    # Verifiable credentials API
│   ├── EmailService.js       # SMTP notifications
│   ├── EncryptionService.js  # AES-256-GCM encryption
│   └── SecurityConfig.js     # Security thresholds
├── controllers/              # HTTP request handlers
├── public/                   # Frontend interfaces
│   ├── bank/                 # Banking management UI
│   ├── merchant/             # Payment processing UI
│   └── css/js/               # Shared assets
├── templates/                # Email HTML templates
├── config/                   # System configuration
└── routes/                   # API route definitions
```

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/accounts` | POST | Create account |
| `/api/accounts` | GET | List accounts |
| `/api/credentials/issue` | POST | Issue credential |
| `/api/payments/request` | POST | Create payment |
| `/api/payments/:id/verify-pin` | POST | Complete payment |
| `/api/security/suspend-credential` | POST | Suspend credential |

## 🔒 Security

- **Card Data Encryption**: AES-256-GCM with account-specific keys
- **Configurable Thresholds**: Customize security policies via environment
- **Progressive Response**: Alert → Multiple alerts → Automatic revocation
- **Audit Trail**: Complete logging of all payment attempts
- **Email Integration**: Instant notifications for security events

## 🛠️ Configuration

### Security Levels
```bash
# Conservative (High Security)
MAX_PIN_FAILURES_BEFORE_REVOKE=3
MAX_PIN_FAILURES_BEFORE_ALERT=1

# Balanced (Default)
MAX_PIN_FAILURES_BEFORE_REVOKE=5  
MAX_PIN_FAILURES_BEFORE_ALERT=2

# Development (Permissive)
MAX_PIN_FAILURES_BEFORE_REVOKE=10
MAX_PIN_FAILURES_BEFORE_ALERT=3
```

### Email Templates
Located in `/templates/`:
- `pin-notification.html` - New account PIN delivery
- `security-alert.html` - Failed payment notifications
- `credential-suspended.html` - Suspension confirmations  
- `credential-revoked.html` - Revocation notifications

## 🧪 Development

- **Framework**: Node.js + Express
- **Frontend**: jQuery + Vanilla CSS
- **Database**: JSON files (prototype) 
- **Integration**: Procivis One API
- **Email**: SMTP Gmail integration

*Required for email functionality