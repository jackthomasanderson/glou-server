# Deploying the Glou Stack

**TL;DR**: Use Docker Compose to spin up the entire isolated stack. No manual dependency installation required.

**Prerequisites**:
- Docker & Docker Compose installed and running.

**Action**:
1. Copy the environment configuration file: `cp .env.example .env`
2. Start the isolated stack in the background: `docker-compose up -d`
3. Access the web interface at `http://localhost:3000`. 

**Troubleshooting**:

| Error | Resolution |
| :--- | :--- |
| `port is already allocated` | Another service is using port 3000 (web), 3001 (api), or 5432 (db). Stop the conflicting service or configure alternate ports via `.env`. |
| `database "glou_db" does not exist` | The `db` container has not finished its initial setup. Wait 10 seconds and retry. |
