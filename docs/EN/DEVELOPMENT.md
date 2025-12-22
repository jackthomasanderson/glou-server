# 🛠️ Development & Testing Guide

## 🔐 Authentication System

The authentication system protects the entire server.

### Features
- **Sessions**: Based on secure cookies.
- **Registration**: Strict password validation (8+ chars, Upper, Lower, Digit).
- **Reset**: Secure token system via email (requires SMTP).

## QA

Local test procedures and test scripts have been removed from the main repository. Use Continuous Integration (CI) or staging environments to run test suites and manual scenarios.

## 🏗️ Frontend Architecture
The frontend is a React application served by the Go binary.
- **Build**: `npm run build` in the `web/` folder.
- **Dev**: `npm run dev` with proxy to the Go backend (port 8080).
