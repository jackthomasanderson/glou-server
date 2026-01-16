import { hashPassword, comparePassword } from '../bcrypt.js';

describe('Bcrypt Utility', () => {
    const password = 'mySecretPassword123!';

    test('should hash a password correctly', async () => {
        const hash = await hashPassword(password);
        expect(hash).toBeDefined();
        expect(typeof hash).toBe('string');
        expect(hash).not.toBe(password);
        expect(hash.length).toBeGreaterThan(0);
    });

    test('should verify a correct password', async () => {
        const hash = await hashPassword(password);
        const isValid = await comparePassword(password, hash);
        expect(isValid).toBe(true);
    });

    test('should reject an incorrect password', async () => {
        const hash = await hashPassword(password);
        const isValid = await comparePassword('wrongPassword', hash);
        expect(isValid).toBe(false);
    });
});
