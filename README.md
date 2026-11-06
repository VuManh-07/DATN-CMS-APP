# DATN CMS - Card Management System

Card Management System for the smart-card cold wallet graduation project.

## Project structure

- cms-server: Express and TypeScript backend.
- cms-desktop: Electron and React operator terminal.

## Main modules

Backend:
- Authentication and role-based authorization
- Card and cardholder management
- Key set management
- Card issuance, personalization and lifecycle
- SCP03 secure-channel services
- Audit logging and reporting

Desktop:
- Login and dashboard
- Card and user management
- Key management
- Personalization wizard
- PC/SC reader integration
- Audit logs

## Development setup

### Backend

Requirements: Node.js, MongoDB and Redis.

cd cms-server
npm install

Copy .env.example to .env and configure the environment.

npm run server:dev

Default development API prefix: /api/v1

### Desktop

cd cms-desktop
yarn install

Copy .env.example to .env and configure CMS_API_BASE_URL.

yarn start

Physical card operations require compatible PC/SC hardware
and drivers. NXP JCShell must be installed separately if needed.

## Development-only tooling

The standalone development server and demo seed scripts are
included from the original source.

WARNING: The demo seed can delete existing collections and
uses fixed demonstration credentials and test keys. Never run
it against production or real cardholder data.

## Project status

GD3 source consolidation. Source availability does not imply
that real-card interoperability, end-to-end integration or
security testing has been completed.

## Security

Do not commit real .env files, database credentials,
private keys or production key-encryption material.

Production deployment requires security review, strong
secrets, API access controls and real-card testing.
