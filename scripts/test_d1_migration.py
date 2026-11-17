#!/usr/bin/env python3
"""Exercise the real Wrangler SQL migrations against existing SQLite data.

Run with: python3 scripts/test_d1_migration.py

D1 uses SQLite. This checks schema/data compatibility, not remote Cloudflare state.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "migrations"
FIRST = (MIGRATIONS / "0001_initial.sql").read_text(encoding="utf-8")
SECOND = (MIGRATIONS / "0002_scenes_schedules.sql").read_text(encoding="utf-8")

DISPLAYS = [
    ("Ab12Cd34-aaaaaaaaaaaa", "Ab12Cd34", "aaaaaaaaaaaa", "Hallway", "9192", "Slussen", 30),
    ("Ab12Cd34-bbbbbbbbbbbb", "Ab12Cd34", "bbbbbbbbbbbb", "Kitchen", None, None, 45),
    ("Ef56Gh78-cccccccccccc", "Ef56Gh78", "cccccccccccc", "Office", "1011", "Fridhemsplan", 60),
]
FILTER_TABLES = {
    "line": ("display_line_filters", "data_source_line_filters", "line_number"),
    "direction": ("display_direction_filters", "data_source_direction_filters", "direction"),
    "mode": ("display_mode_filters", "data_source_mode_filters", "mode"),
}


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript(FIRST)
    return connection


def assert_foreign_keys(connection: sqlite3.Connection) -> None:
    assert connection.execute("PRAGMA foreign_key_check").fetchall() == [], "Foreign-key violations"


def seed(connection: sqlite3.Connection) -> None:
    connection.executemany("INSERT INTO owners(id) VALUES (?)", [("Ab12Cd34",), ("Ef56Gh78",)])
    connection.executemany(
        """
        INSERT INTO displays
          (id, owner_id, display_id, name, site_id, site_name, refresh_interval)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        DISPLAYS,
    )
    connection.executemany(
        "INSERT INTO display_line_filters(display_id, line_number) VALUES (?, ?)",
        [
            (DISPLAYS[0][0], "17"),
            (DISPLAYS[0][0], "18"),
            (DISPLAYS[2][0], "10"),
        ],
    )
    connection.executemany(
        "INSERT INTO display_direction_filters(display_id, direction) VALUES (?, ?)",
        [
            (DISPLAYS[0][0], "Hagsätra"),
            (DISPLAYS[2][0], "Solna"),
        ],
    )
    connection.executemany(
        "INSERT INTO display_mode_filters(display_id, mode) VALUES (?, ?)",
        [
            (DISPLAYS[0][0], "METRO"),
            (DISPLAYS[2][0], "BUS"),
        ],
    )
    connection.commit()


def verify_migrated(connection: sqlite3.Connection) -> None:
    # Old table data and IDs remain exactly as they were.
    rows = connection.execute(
        "SELECT id, owner_id, display_id, name, site_id, site_name, refresh_interval FROM displays ORDER BY id"
    ).fetchall()
    assert [tuple(row) for row in rows] == sorted(DISPLAYS)

    for display in DISPLAYS:
        display_id, owner, _, name, site, site_name, refresh = display
        source_id = "legacy-source:" + display_id
        scene_id = "legacy-scene:" + display_id
        source = connection.execute(
            "SELECT owner_id, name, site_id, site_name, refresh_interval FROM data_sources WHERE id = ?",
            (source_id,),
        ).fetchone()
        assert source is not None, display_id
        assert source["owner_id"] == owner
        assert source["site_id"] == site
        assert source["site_name"] == site_name
        assert source["refresh_interval"] == refresh
        assert source["name"] == (site_name or name or "Existing stop")

        scene = connection.execute(
            "SELECT owner_id, name, data_source_id, visualization FROM scenes WHERE id = ?",
            (scene_id,),
        ).fetchone()
        assert scene is not None
        assert tuple(scene) == (owner, name, source_id, "departures-list")

        assignment = connection.execute(
            "SELECT kind, scene_id, schedule_id FROM device_assignments WHERE display_id = ?",
            (display_id,),
        ).fetchone()
        assert assignment is not None
        assert tuple(assignment) == ("scene", scene_id, None)

        for legacy, reusable, column in FILTER_TABLES.values():
            old = [
                row[0] for row in connection.execute(
                    f"SELECT {column} FROM {legacy} WHERE display_id = ? ORDER BY {column}",
                    (display_id,),
                ).fetchall()
            ]
            new = [
                row[0] for row in connection.execute(
                    f"SELECT {column} FROM {reusable} WHERE data_source_id = ? ORDER BY {column}",
                    (source_id,),
                ).fetchall()
            ]
            assert new == old, (display_id, legacy, old, new)

    assert_foreign_keys(connection)


def verify_constraints(connection: sqlite3.Connection) -> None:
    # One schedule can be shared by multiple devices.
    connection.execute(
        "INSERT INTO schedules(id, owner_id, name, timezone) VALUES (?, ?, ?, ?)",
        ("shared-workdays", "Ab12Cd34", "Workdays", "Europe/Stockholm"),
    )
    connection.execute(
        """INSERT INTO schedule_rules
          (id, schedule_id, days, start_time, end_time, scene_id)
          VALUES (?, ?, ?, ?, ?, ?)""",
        ("morning", "shared-workdays", "[0,1,2,3,4]", "06:00", "09:00", "legacy-scene:" + DISPLAYS[0][0]),
    )
    for device_id in [DISPLAYS[0][0], DISPLAYS[1][0]]:
        connection.execute(
            """UPDATE device_assignments
            SET kind = 'schedule', scene_id = NULL, schedule_id = ?
            WHERE display_id = ?""",
            ("shared-workdays", device_id),
        )
    assert connection.execute(
        "SELECT COUNT(*) FROM device_assignments WHERE schedule_id = 'shared-workdays'"
    ).fetchone()[0] == 2

    # Neither ambiguous assignment nor deleting an in-use scene is allowed.
    try:
        connection.execute(
            """UPDATE device_assignments SET kind = 'schedule',
               scene_id = ?, schedule_id = 'shared-workdays' WHERE display_id = ?""",
            ("legacy-scene:" + DISPLAYS[0][0], DISPLAYS[0][0]),
        )
        raise AssertionError("A device cannot select both a scene and a schedule")
    except sqlite3.IntegrityError:
        pass
    try:
        connection.execute("DELETE FROM scenes WHERE id = ?", ("legacy-scene:" + DISPLAYS[0][0],))
        raise AssertionError("A scene used by a schedule must not be deleted")
    except sqlite3.IntegrityError:
        pass
    assert_foreign_keys(connection)


def main() -> None:
    connection = connect()
    seed(connection)
    connection.executescript(SECOND)
    verify_migrated(connection)
    verify_constraints(connection)
    connection.close()

    # Also verify the migration can be applied with no existing devices.
    connection = connect()
    connection.executescript(SECOND)
    assert connection.execute("SELECT COUNT(*) FROM scenes").fetchone()[0] == 0
    assert_foreign_keys(connection)
    connection.close()
    print("D1 migration fixture passed: no data loss, shared schedules, FK constraints, empty database")


if __name__ == "__main__":
    main()
