import sqlite3
import sys

db='glou.db'
email='romaindslv@gmail.com'
try:
    conn=sqlite3.connect(db)
    cur=conn.cursor()
    cur.execute('DELETE FROM users WHERE email=?', (email,))
    conn.commit()
    print('Deleted rows:', cur.rowcount)
    cur.execute('SELECT id,username,email FROM users')
    rows=cur.fetchall()
    if rows:
        print('Remaining users:')
        for r in rows:
            print(r)
    else:
        print('No remaining users')
    conn.close()
except Exception as e:
    print('ERROR:', e)
    sys.exit(1)
