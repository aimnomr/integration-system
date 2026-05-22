"""PostgreSQL access for the FastAPI gateway.

The driver (psycopg2) is imported lazily so the service still boots when the
database — or the driver — is unavailable. In that case queries raise
DatabaseUnavailable, which the routers turn into HTTP 503.

Connections are served from a lazily-built ThreadedConnectionPool (G16) — a
fresh TCP connect + auth handshake per query was needless latency on the
telemetry hot path. Pool size: DB_POOL_MIN / DB_POOL_MAX.

The schema is fully normalized (15 tables) — VDA5050's variable-length arrays
live in child tables, so persisting one `state` or `order` message is a
multi-table transaction. See docs/schema/DATABASE_SCHEMA.md.

Connection settings come from env vars (DB_HOST, DB_PORT, DB_NAME, DB_USER,
DB_PASSWORD).
"""
import os
import threading
from contextlib import contextmanager


class DatabaseUnavailable(RuntimeError):
    """Raised when the database or its driver cannot be reached."""


class IntegrityConflict(RuntimeError):
    """Raised on a constraint violation (foreign-key / unique) so the CRUD
    routers can return HTTP 409 instead of an opaque 500."""


# --- Connection pool (G16) -------------------------------------------------

_pool = None
_pool_lock = threading.Lock()


def _get_pool():
    """Return the connection pool, building it lazily on first use. Raises
    DatabaseUnavailable if the driver is missing or the database is unreachable."""
    global _pool
    if _pool is not None:
        return _pool
    with _pool_lock:
        if _pool is not None:  # built while we waited for the lock
            return _pool
        try:
            import psycopg2.pool
        except ImportError as exc:  # driver not installed
            raise DatabaseUnavailable("psycopg2 not installed") from exc
        try:
            _pool = psycopg2.pool.ThreadedConnectionPool(
                int(os.getenv("DB_POOL_MIN", "1")),
                int(os.getenv("DB_POOL_MAX", "10")),
                host=os.getenv("DB_HOST", "localhost"),
                port=int(os.getenv("DB_PORT", "5432")),
                dbname=os.getenv("DB_NAME", "amr_integration"),
                user=os.getenv("DB_USER", "postgres"),
                password=os.getenv("DB_PASSWORD", "admin"),
            )
        except Exception as exc:  # connection refused, auth failure, ...
            raise DatabaseUnavailable(str(exc)) from exc
        return _pool


def _invalidate_pool() -> None:
    """Close and forget the pool so the next call rebuilds it. Called when a
    pooled connection turns out to be dead — without this, every subsequent
    request would re-borrow the same stale connection and keep 500-ing."""
    global _pool
    with _pool_lock:
        if _pool is None:
            return
        try:
            _pool.closeall()
        except Exception:
            pass
        _pool = None


def _connection_exc_types() -> tuple:
    """Tuple of psycopg2 exception classes that mean 'database is unreachable'
    (as opposed to a SQL or programming error). Resolved lazily because
    psycopg2 may not be installed in every environment."""
    import psycopg2
    return (psycopg2.OperationalError, psycopg2.InterfaceError)


def _pg_message(exc) -> str:
    """The clean primary message of a psycopg2 error, without the SQL dump."""
    try:
        return (exc.diag.message_primary or str(exc)).strip()
    except Exception:
        return str(exc).strip()


def _to_unavailable(exc) -> "DatabaseUnavailable":
    """Build a DatabaseUnavailable from a psycopg2 connection error AND
    invalidate the cached pool so the next call rebuilds it (G24).

    Without invalidation, a pooled connection that died with the database
    would keep being handed back to callers, so every request would 500 even
    after Postgres recovered."""
    _invalidate_pool()
    return DatabaseUnavailable(_pg_message(exc))


@contextmanager
def _transaction():
    """A single pooled connection committed as one unit — used by the
    multi-table writes so a snapshot and its child rows land atomically. A
    connection that cannot be cleaned up is dropped rather than handed back.

    Connection-level psycopg2 errors are translated into DatabaseUnavailable
    (G24) so the routers' `except DatabaseUnavailable` blocks fire — without
    this the pool happily hands out stale connections after Postgres restarts
    and every request 500s instead of 503-ing."""
    pool = _get_pool()
    conn = pool.getconn()
    broken = False
    try:
        try:
            with conn.cursor() as cur:
                yield cur
            conn.commit()
        except _connection_exc_types() as exc:
            broken = True
            try:
                conn.rollback()
            except Exception:
                pass
            raise _to_unavailable(exc) from exc
        except Exception:
            try:
                conn.rollback()
            except Exception:
                broken = True
            raise
    finally:
        pool.putconn(conn, close=broken)


def _query(sql: str, params: tuple = ()) -> list[dict]:
    """Run a read-only query and return the rows. The connection's implicit
    transaction is rolled back before it returns to the pool."""
    import psycopg2.extras

    pool = _get_pool()
    try:
        conn = pool.getconn()
    except _connection_exc_types() as exc:
        raise _to_unavailable(exc) from exc
    broken = False
    try:
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                if cur.description is None:
                    return []
                return [dict(row) for row in cur.fetchall()]
        except _connection_exc_types() as exc:
            broken = True
            raise _to_unavailable(exc) from exc
    finally:
        try:
            conn.rollback()
        except Exception:
            broken = True
        pool.putconn(conn, close=broken)


def _execute(sql: str, params: tuple = ()) -> None:
    pool = _get_pool()
    try:
        conn = pool.getconn()
    except _connection_exc_types() as exc:
        raise _to_unavailable(exc) from exc
    broken = False
    try:
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
            conn.commit()
        except _connection_exc_types() as exc:
            broken = True
            try:
                conn.rollback()
            except Exception:
                pass
            raise _to_unavailable(exc) from exc
        except Exception:
            try:
                conn.rollback()
            except Exception:
                broken = True
            raise
    finally:
        pool.putconn(conn, close=broken)


def _execute_returning(sql: str, params: tuple = ()) -> list[dict]:
    """Run a write with a RETURNING clause, commit, and return the rows.
    Postgres integrity violations are translated into IntegrityConflict so the
    CRUD routers can map them to HTTP 409; connection-level failures become
    DatabaseUnavailable so they become HTTP 503 instead of 500 (G24)."""
    import psycopg2
    import psycopg2.extras

    pool = _get_pool()
    try:
        conn = pool.getconn()
    except _connection_exc_types() as exc:
        raise _to_unavailable(exc) from exc
    broken = False
    try:
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                rows = [] if cur.description is None else [dict(r) for r in cur.fetchall()]
            conn.commit()
            return rows
        except psycopg2.IntegrityError as exc:
            try:
                conn.rollback()
            except Exception:
                broken = True
            raise IntegrityConflict(_pg_message(exc)) from exc
        except _connection_exc_types() as exc:
            broken = True
            try:
                conn.rollback()
            except Exception:
                pass
            raise _to_unavailable(exc) from exc
        except Exception:
            try:
                conn.rollback()
            except Exception:
                broken = True
            raise
    finally:
        pool.putconn(conn, close=broken)


def ping() -> bool:
    """True if the database is reachable.

    Runs `SELECT 1` rather than just borrowing a connection — a pooled
    connection can survive a Postgres restart in the pool's bookkeeping
    while being dead on the wire, so `pool.getconn()` succeeds but the next
    query throws (G24). Probing with a real query is the only way to be sure.
    """
    try:
        rows = _query("SELECT 1 AS ok")
        return bool(rows) and rows[0].get("ok") == 1
    except DatabaseUnavailable:
        return False


# --- Writes (ingestion: Node-RED -> /ingest/* -> here) ---

def insert_state(msg: dict) -> None:
    """Persist one VDA5050 `state` message: one state_snapshots row plus its
    nodeStates / actionStates / errors child rows, in a single transaction."""
    pos = msg.get("agvPosition") or {}
    vel = msg.get("velocity") or {}
    safety = msg.get("safetyState") or {}
    with _transaction() as cur:
        cur.execute(
            """
            INSERT INTO state_snapshots
                (serial_number, ts, header_id, order_id, order_update_id,
                 last_node_id, last_node_sequence_id, pos_x, pos_y, theta, map_id,
                 position_initialized, vel_vx, vel_vy, vel_omega, driving,
                 operating_mode, e_stop, field_violation)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s)
            RETURNING id
            """,
            (
                msg["serialNumber"], msg["timestamp"], msg.get("headerId", 0),
                msg.get("orderId"), msg.get("orderUpdateId"),
                msg.get("lastNodeId"), msg.get("lastNodeSequenceId"),
                pos.get("x"), pos.get("y"), pos.get("theta"), pos.get("mapId"),
                pos.get("positionInitialized"),
                vel.get("vx"), vel.get("vy"), vel.get("omega"),
                msg.get("driving"), msg.get("operatingMode"),
                safety.get("eStop"), safety.get("fieldViolation"),
            ),
        )
        snapshot_id = cur.fetchone()[0]

        node_states = [
            (snapshot_id, n.get("nodeId"), n.get("sequenceId"), n.get("released"))
            for n in msg.get("nodeStates", [])
        ]
        if node_states:
            cur.executemany(
                "INSERT INTO state_node_states "
                "(snapshot_id, node_id, sequence_id, released) "
                "VALUES (%s, %s, %s, %s)",
                node_states,
            )

        action_states = [
            (snapshot_id, a.get("actionId"), a.get("actionType"),
             a.get("actionStatus"))
            for a in msg.get("actionStates", [])
        ]
        if action_states:
            cur.executemany(
                "INSERT INTO state_action_states "
                "(snapshot_id, action_id, action_type, action_status) "
                "VALUES (%s, %s, %s, %s)",
                action_states,
            )

        errors = [
            (snapshot_id, e.get("errorType"), e.get("errorLevel"),
             e.get("errorDescription"))
            for e in msg.get("errors", [])
        ]
        if errors:
            cur.executemany(
                "INSERT INTO state_errors "
                "(snapshot_id, error_type, error_level, error_description) "
                "VALUES (%s, %s, %s, %s)",
                errors,
            )


def insert_connection(msg: dict) -> None:
    """Persist one VDA5050 `connection` message."""
    _execute(
        "INSERT INTO connection_log (serial_number, ts, header_id, connection_state) "
        "VALUES (%s, %s, %s, %s)",
        (
            msg["serialNumber"], msg["timestamp"],
            msg.get("headerId", 0), msg["connectionState"],
        ),
    )


def insert_command(kind: str, message: dict) -> None:
    """Persist one `order` or `instantActions` message to the audit log.

    Each kind fans out to its own header + child tables; the router calls this
    with the same signature regardless of kind."""
    if kind == "order":
        _insert_order(message)
    elif kind == "instantActions":
        _insert_instant_actions(message)
    else:
        raise ValueError(f"Unknown command kind: {kind!r}")


def _insert_order(msg: dict) -> None:
    """orders header + order_nodes + order_edges, in one transaction."""
    with _transaction() as cur:
        cur.execute(
            "INSERT INTO orders "
            "(serial_number, ts, header_id, order_id, order_update_id) "
            "VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (
                msg["serialNumber"], msg["timestamp"], msg.get("headerId", 0),
                msg.get("orderId"), msg.get("orderUpdateId", 0),
            ),
        )
        order_pk = cur.fetchone()[0]

        nodes = []
        for n in msg.get("nodes", []):
            p = n.get("nodePosition") or {}
            nodes.append((
                order_pk, n.get("nodeId"), n.get("sequenceId"), n.get("released"),
                p.get("x"), p.get("y"), p.get("theta"), p.get("mapId"),
            ))
        if nodes:
            cur.executemany(
                "INSERT INTO order_nodes "
                "(order_pk, node_id, sequence_id, released, "
                " pos_x, pos_y, theta, map_id) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                nodes,
            )

        edges = [
            (order_pk, e.get("edgeId"), e.get("sequenceId"), e.get("released"),
             e.get("startNodeId"), e.get("endNodeId"))
            for e in msg.get("edges", [])
        ]
        if edges:
            cur.executemany(
                "INSERT INTO order_edges "
                "(order_pk, edge_id, sequence_id, released, "
                " start_node_id, end_node_id) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                edges,
            )


def _insert_instant_actions(msg: dict) -> None:
    """instant_action_messages header + instant_actions, in one transaction."""
    with _transaction() as cur:
        cur.execute(
            "INSERT INTO instant_action_messages (serial_number, ts, header_id) "
            "VALUES (%s, %s, %s) RETURNING id",
            (msg["serialNumber"], msg["timestamp"], msg.get("headerId", 0)),
        )
        message_pk = cur.fetchone()[0]

        actions = [
            (message_pk, a.get("actionId"), a.get("actionType"),
             a.get("blockingType", "NONE"))
            for a in msg.get("actions", [])
        ]
        if actions:
            cur.executemany(
                "INSERT INTO instant_actions "
                "(message_pk, action_id, action_type, blocking_type) "
                "VALUES (%s, %s, %s, %s)",
                actions,
            )


def insert_oee_cycle(cycle: dict) -> None:
    """Persist one derived OEE cycle. duration_s is computed by the DB (GENERATED)."""
    _execute(
        "INSERT INTO oee_cycles (serial_number, order_id, start_time, end_time, result) "
        "VALUES (%s, %s, %s, %s, %s)",
        (
            cycle["serialNumber"], cycle["orderId"],
            cycle["startTime"], cycle["endTime"], cycle["result"],
        ),
    )


# --- Reads (query API) ---

def fetch_latest_state(serial: str) -> dict | None:
    """The latest state_snapshots row with its child rows joined back in, so the
    response carries the full VDA5050 `state` shape."""
    import psycopg2.extras

    pool = _get_pool()
    try:
        conn = pool.getconn()
    except _connection_exc_types() as exc:
        raise _to_unavailable(exc) from exc
    broken = False
    try:
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    "SELECT * FROM state_snapshots WHERE serial_number = %s "
                    "ORDER BY ts DESC LIMIT 1",
                    (serial,),
                )
                snap = cur.fetchone()
                if snap is None:
                    return None
                snap = dict(snap)
                sid = snap["id"]

                cur.execute(
                    "SELECT node_id, sequence_id, released FROM state_node_states "
                    "WHERE snapshot_id = %s ORDER BY id",
                    (sid,),
                )
                snap["node_states"] = [dict(r) for r in cur.fetchall()]

                cur.execute(
                    "SELECT action_id, action_type, action_status "
                    "FROM state_action_states WHERE snapshot_id = %s ORDER BY id",
                    (sid,),
                )
                snap["action_states"] = [dict(r) for r in cur.fetchall()]

                cur.execute(
                    "SELECT error_type, error_level, error_description "
                    "FROM state_errors WHERE snapshot_id = %s ORDER BY id",
                    (sid,),
                )
                snap["errors"] = [dict(r) for r in cur.fetchall()]
                return snap
        except _connection_exc_types() as exc:
            broken = True
            raise _to_unavailable(exc) from exc
    finally:
        try:
            conn.rollback()
        except Exception:
            broken = True
        pool.putconn(conn, close=broken)


def fetch_fleet_config() -> dict:
    """Fleet-wide VDA5050 identity (the single fleet_config row)."""
    rows = _query(
        "SELECT interface_name, major_version, version, manufacturer "
        "FROM fleet_config WHERE id = 1"
    )
    if not rows:
        raise DatabaseUnavailable("fleet_config is empty — apply schema.sql")
    return rows[0]


def fetch_robots() -> list[dict]:
    """The fleet roster, ordered by serial number."""
    return _query(
        "SELECT serial_number, rosbridge_url, map_id FROM robots "
        "ORDER BY serial_number"
    )


def fetch_named_locations() -> dict[int, dict]:
    """All named navigation targets, keyed by id. theta is in radians (map frame)."""
    rows = _query(
        "SELECT id, map_id, label, x, y, theta FROM named_locations ORDER BY id"
    )
    return {row["id"]: row for row in rows}


def fetch_oee_cycles(serial: str, limit: int = 50) -> list[dict]:
    return _query(
        "SELECT * FROM oee_cycles WHERE serial_number = %s "
        "ORDER BY ts DESC LIMIT %s",
        (serial, limit),
    )


def fetch_oee_summary(serial: str) -> dict:
    rows = _query(
        """
        SELECT count(*)                                          AS total_cycles,
               count(*) FILTER (WHERE result = 'SUCCEEDED')       AS succeeded,
               count(*) FILTER (WHERE result <> 'SUCCEEDED')      AS failed,
               coalesce(round(avg(duration_s)::numeric, 2), 0)    AS avg_duration_s
        FROM oee_cycles WHERE serial_number = %s
        """,
        (serial,),
    )
    return rows[0] if rows else {}


def fetch_oee_availability(serial: str) -> dict:
    """Rough availability — fraction of state snapshots in which the robot was
    driving. A proper SLO-style metric would weight by time; this is adequate for
    the FYP scope."""
    rows = _query(
        """
        SELECT count(*) FILTER (WHERE driving) AS driving_samples,
               count(*)                        AS total_samples
        FROM state_snapshots WHERE serial_number = %s
        """,
        (serial,),
    )
    row = rows[0] if rows else {"driving_samples": 0, "total_samples": 0}
    total = row["total_samples"] or 0
    availability = (row["driving_samples"] / total) if total else 0.0
    return {
        "driving_samples": row["driving_samples"],
        "total_samples": total,
        "availability": round(availability, 4),
    }


# --- Counter persistence (G21) ---------------------------------------------
#
# The FMS gateway's VDA5050 headerId / orderId counters live in memory in
# RobotRegistry. These helpers let it resume them from the database at startup
# so a FastAPI restart does not reset them to 0.

def fetch_max_header_ids() -> dict[tuple[str, str], int]:
    """Highest headerId persisted per (serial, topic), across the order /
    instantActions audit tables — the topics FastAPI itself generates."""
    result: dict[tuple[str, str], int] = {}
    for topic, table in (("order", "orders"),
                          ("instantActions", "instant_action_messages")):
        rows = _query(
            f"SELECT serial_number, MAX(header_id) AS max_id "
            f"FROM {table} GROUP BY serial_number"
        )
        for row in rows:
            if row["max_id"] is not None:
                result[(row["serial_number"], topic)] = row["max_id"]
    return result


def fetch_orders(
    serial: str | None = None,
    limit: int = 50,
    before: str | None = None,
) -> list[dict]:
    """Order history, newest first. Optional filters:
      * `serial` — restrict to one robot.
      * `before` — ISO-8601 timestamp; only rows with ts < this value.
    `limit` is clamped by the caller (router). Each row carries the count of
    nodes in the order — cheap aggregate that saves the UI a second round trip.
    """
    where: list[str] = []
    params: list = []
    if serial:
        where.append("o.serial_number = %s")
        params.append(serial)
    if before:
        where.append("o.ts < %s")
        params.append(before)
    sql = (
        "SELECT o.id, o.serial_number, o.ts, o.header_id, "
        "       o.order_id, o.order_update_id, "
        "       coalesce(n.node_count, 0) AS node_count "
        "FROM orders o "
        "LEFT JOIN ("
        "    SELECT order_pk, count(*) AS node_count "
        "    FROM order_nodes GROUP BY order_pk"
        ") n ON n.order_pk = o.id "
    )
    if where:
        sql += "WHERE " + " AND ".join(where) + " "
    sql += "ORDER BY o.ts DESC LIMIT %s"
    params.append(limit)
    return _query(sql, tuple(params))


def fetch_max_order_suffixes() -> dict[str, int]:
    """Highest order-id suffix N (orderId is `{serial}-order-N`) per robot."""
    rows = _query(
        "SELECT serial_number, "
        "MAX(CAST(split_part(order_id, '-order-', 2) AS INTEGER)) AS max_n "
        "FROM orders "
        "WHERE split_part(order_id, '-order-', 2) ~ '^[0-9]+$' "
        "GROUP BY serial_number"
    )
    return {r["serial_number"]: r["max_n"] for r in rows if r["max_n"] is not None}


# --- Telemetry retention (G19) ---------------------------------------------

def prune_telemetry(retention_days: int) -> dict:
    """Delete telemetry rows older than retention_days. state_snapshots' child
    tables (node/action/error states) are removed via ON DELETE CASCADE.
    Returns the deleted row counts."""
    snaps = _execute_returning(
        "DELETE FROM state_snapshots "
        "WHERE ts < now() - make_interval(days => %s) RETURNING id",
        (retention_days,),
    )
    conns = _execute_returning(
        "DELETE FROM connection_log "
        "WHERE ts < now() - make_interval(days => %s) RETURNING id",
        (retention_days,),
    )
    return {"state_snapshots": len(snaps), "connection_log": len(conns)}


# --- Reference-data CRUD (G15) ---------------------------------------------
#
# Per-row create / update / delete for the reference tables, so editing them no
# longer means re-applying schema.sql (which drops every table). FK violations
# surface as IntegrityConflict (-> HTTP 409); deletes are never cascaded.

# Maps
def fetch_maps() -> list[dict]:
    return _query("SELECT map_id, label FROM maps ORDER BY map_id")


def fetch_map(map_id: str) -> dict | None:
    rows = _query("SELECT map_id, label FROM maps WHERE map_id = %s", (map_id,))
    return rows[0] if rows else None


def insert_map(map_id: str, label: str) -> dict:
    return _execute_returning(
        "INSERT INTO maps (map_id, label) VALUES (%s, %s) "
        "RETURNING map_id, label",
        (map_id, label),
    )[0]


def update_map(map_id: str, label: str) -> dict | None:
    rows = _execute_returning(
        "UPDATE maps SET label = %s WHERE map_id = %s RETURNING map_id, label",
        (label, map_id),
    )
    return rows[0] if rows else None


def delete_map(map_id: str) -> bool:
    return bool(_execute_returning(
        "DELETE FROM maps WHERE map_id = %s RETURNING map_id", (map_id,)
    ))


# Robots
def fetch_robot(serial: str) -> dict | None:
    rows = _query(
        "SELECT serial_number, rosbridge_url, map_id FROM robots "
        "WHERE serial_number = %s",
        (serial,),
    )
    return rows[0] if rows else None


def insert_robot(serial: str, rosbridge_url: str, map_id: str) -> dict:
    return _execute_returning(
        "INSERT INTO robots (serial_number, rosbridge_url, map_id) "
        "VALUES (%s, %s, %s) RETURNING serial_number, rosbridge_url, map_id",
        (serial, rosbridge_url, map_id),
    )[0]


def update_robot(serial: str, rosbridge_url: str, map_id: str) -> dict | None:
    rows = _execute_returning(
        "UPDATE robots SET rosbridge_url = %s, map_id = %s "
        "WHERE serial_number = %s "
        "RETURNING serial_number, rosbridge_url, map_id",
        (rosbridge_url, map_id, serial),
    )
    return rows[0] if rows else None


def delete_robot(serial: str) -> bool:
    return bool(_execute_returning(
        "DELETE FROM robots WHERE serial_number = %s RETURNING serial_number",
        (serial,),
    ))


# Named locations
def fetch_named_location(loc_id: int) -> dict | None:
    rows = _query(
        "SELECT id, map_id, label, x, y, theta FROM named_locations WHERE id = %s",
        (loc_id,),
    )
    return rows[0] if rows else None


def insert_named_location(loc_id: int, map_id: str, label: str,
                          x: float, y: float, theta: float) -> dict:
    return _execute_returning(
        "INSERT INTO named_locations (id, map_id, label, x, y, theta) "
        "VALUES (%s, %s, %s, %s, %s, %s) "
        "RETURNING id, map_id, label, x, y, theta",
        (loc_id, map_id, label, x, y, theta),
    )[0]


def update_named_location(loc_id: int, map_id: str, label: str,
                          x: float, y: float, theta: float) -> dict | None:
    rows = _execute_returning(
        "UPDATE named_locations SET map_id = %s, label = %s, x = %s, y = %s, "
        "theta = %s WHERE id = %s RETURNING id, map_id, label, x, y, theta",
        (map_id, label, x, y, theta, loc_id),
    )
    return rows[0] if rows else None


def delete_named_location(loc_id: int) -> bool:
    return bool(_execute_returning(
        "DELETE FROM named_locations WHERE id = %s RETURNING id", (loc_id,)
    ))


# Fleet config (single row, id = 1)
def update_fleet_config(interface_name: str, major_version: str,
                        version: str, manufacturer: str) -> dict:
    return _execute_returning(
        "UPDATE fleet_config SET interface_name = %s, major_version = %s, "
        "version = %s, manufacturer = %s WHERE id = 1 "
        "RETURNING interface_name, major_version, version, manufacturer",
        (interface_name, major_version, version, manufacturer),
    )[0]
