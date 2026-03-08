# Environment Setup

**TL;DR**: Configure your `.env` file to set up database credentials and API secrets.

**Prerequisites**:
- The `.env` file created from `.env.example`.

**Action**:
1. Open the `.env` file in the project root.
2. Set `DB_USER`, `DB_PASSWORD`, and `DB_NAME` to your preferred PostgreSQL credentials.
3. Generate a strong, random 32-character string and set it as `JWT_SECRET`.
4. Run `docker-compose up -d` for changes to take effect.

**Troubleshooting**:

| Error | Resolution |
| :--- | :--- |
| `JWT_SECRET is missing` | Ensure the variable exists in `.env` and contains a long, secure string. |
| `password authentication failed for user` | Ensure `.env` database variables match what was used when the `db` volume was first securely created. You may need to wipe the volume `db_data` if credentials changed. |
