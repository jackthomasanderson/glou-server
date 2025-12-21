import sqlite3
import sys

DB = 'glou.db'
try:
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute("SELECT id, username, email, created_at FROM users")
    rows = cur.fetchall()
    if not rows:
        print('No users found in', DB)
    else:
        print(f'Found {len(rows)} user(s) in {DB}:')
        for r in rows:
            print(r)
    conn.close()
except Exception as e:
    print('ERROR:', e)
    sys.exit(1)
