"""PostgreSQL access for the FastAPI gateway.

The driver (psycopg2) is imported lazily so the service still boots when the
database — or the driver — is unavailable. In that case queries raise
DatabaseUnavailable, which the routers turn into HTTP 503.

Connection settings come from env vars (DB_HOST, DB_PORT, DB_NAME, DB_USER,
DB_PASSWORD). Schema: see docs/schema/DATABASE_SCHEMA.md.
"""
import json
import os


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
    """Persist one VDA5050 `state` message."""
    pos = msg.get("agvPosition") or {}
    vel = msg.get("velocity") or {}
    safety = msg.get("safetyState") or {}
    _execute(
        """
        INSERT INTO state_snapshots
            (serial_number, ts, header_id, order_id, order_update_id,
             last_node_id, last_node_sequence_id, pos_x, pos_y, theta, map_id,
             position_initialized, vel_vx, vel_vy, vel_omega, driving,
             operating_mode, e_stop, field_violation,
             node_states, edge_states, action_states, errors)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb)
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
            json.dumps(msg.get("nodeStates", [])),
            json.dumps(msg.get("edgeStates", [])),
            json.dumps(msg.get("actionStates", [])),
            json.dumps(msg.get("errors", [])),
        ),
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
    """Persist one `order` or `instantActions` message to the audit log."""
    _execute(
        "INSERT INTO order_log (serial_number, ts, kind, header_id, order_id, message) "
        "VALUES (%s, %s, %s, %s, %s, %s::jsonb)",
        (
            message["serialNumber"], message["timestamp"], kind,
            message.get("headerId", 0), message.get("orderId"),
            json.dumps(message),
        ),
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
    rows = _query(
        "SELECT * FROM state_snapshots WHERE serial_number = %s "
        "ORDER BY ts DESC LIMIT 1",
        (serial,),
    )
    return rows[0] if rows else None


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
