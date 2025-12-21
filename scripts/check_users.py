import sqlite3

db='glou.db'
conn=sqlite3.connect(db)
cur=conn.cursor()
try:
    cur.execute("SELECT id, username, email FROM users ORDER BY id")
    rows=cur.fetchall()
    if not rows:
        print('No users found')
    else:
        print('Users in database:')
        for r in rows:
            print(f"  ID: {r[0]}, Username: {r[1]}, Email: {r[2]}")
except Exception as e:
    print('ERROR:', e)
finally:
    conn.close()
