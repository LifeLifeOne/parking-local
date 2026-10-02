"""Checks the real application startup database, without touching user data."""
import json
import sqlite3
import sys
from pathlib import Path

root = Path(sys.argv[1])
assert (root / "parking.sqlite").is_file(), "L'application n'a pas créé sa base"
with sqlite3.connect(root / "parking.sqlite") as db:
    assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert db.execute("PRAGMA user_version").fetchone()[0] == 1
    settings = json.loads(db.execute("SELECT value FROM settings WHERE key='settings'").fetchone()[0])
    if len(sys.argv) > 2 and sys.argv[2] == "seed":
        settings["capacity"] = 37
        db.execute("UPDATE settings SET value=? WHERE key='settings'", (json.dumps(settings),))
        db.execute("INSERT INTO clients(name,phone) VALUES('Client recette','0612345678')")
    elif len(sys.argv) > 2 and sys.argv[2] == "updated":
        assert settings["capacity"] == 37, "La mise à jour a perdu les réglages"
        assert db.execute("SELECT COUNT(*) FROM clients WHERE name='Client recette'").fetchone()[0] == 1
backups = list((root / "backups").glob("*.sqlite"))
assert backups, "La sauvegarde du premier lancement est absente"
for path in backups:
    with sqlite3.connect(path) as db:
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
print("Lancement réel, base SQLite et sauvegarde vérifiés.")
