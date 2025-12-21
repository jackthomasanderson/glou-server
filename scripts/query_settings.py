import sqlite3
import json

DB='glou.db'
conn=sqlite3.connect(DB)
cur=conn.cursor()
try:
    cur.execute("SELECT name, value FROM settings")
    rows=cur.fetchall()
    if not rows:
        print('No settings rows')
    else:
        for r in rows:
            print(r[0], ':', r[1])
except Exception as e:
    print('ERROR:', e)
finally:
    conn.close()
