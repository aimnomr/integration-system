"""PostgreSQL access for the FastAPI gateway.

The driver (psycopg2) is imported lazily so the service still boots when the
database — or the driver — is unavailable. In that case queries raise
DatabaseUnavailable, which the routers turn into HTTP 503.

The schema is fully normalized (14 tables) — VDA5050's variable-length arrays
live in child tables, so persisting one `state` or `order` message is a
multi-table transaction. See docs/schema/DATABASE_SCHEMA.md.

Connection settings come from env vars (DB_HOST, DB_PORT, DB_NAME, DB_USER,
DB_PASSWORD).
"""
import os
from contextlib import contextmanager


class DatabaseUnavailable(RuntimeError):
    """Raised when the database or its driver cannot be reached."""


def _connect():
    try:
        import psycopg2
    except ImportError as exc:  # driver not installed
        raise DatabaseUnavailable("psycopg2 not installed") from exc
    try:
        return psycopg2.connect(
            host=os.getenv("DB_HOST", "localhost"),
            port=int(os.getenv("DB_PORT", "5432")),
            dbname=os.getenv("DB_NAME", "amr_integration"),
            user=os.getenv("DB_USER", "postgres"),
            password=os.getenv("DB_PASSWORD", "admin"),
        )
    except Exception as exc:  # connection refused, auth failure, ...
        raise DatabaseUnavailable(str(exc)) from exc


@contextmanager
def _transaction():
    """A single connection committed as one unit — used by the multi-table
    writes so a snapshot and its child rows land atomically."""
    conn = _connect()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _query(sql: str, params: tuple = ()) -> list[dict]:
    conn = _connect()
    import psycopg2.extras

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            if cur.description is None:
                return []
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def _execute(sql: str, params: tuple = ()) -> None:
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
        conn.commit()
    finally:
        conn.close()


def ping() -> bool:
    """True if the database is reachable."""
    try:
        _connect().close()
        return True
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
    conn = _connect()
    import psycopg2.extras

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
    finally:
        conn.close()


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
