# Volumes & Networks

Persistent data and how containers talk to each other.

## Volumes

Named volumes survive `docker compose down` (but **not** `down -v`). This
project uses `postgres-data` and `mosquitto-data`.

```bash
docker volume ls                            # list volumes
docker volume inspect integration-system_postgres-data
docker volume create mydata                 # create a named volume
docker volume rm mydata                     # remove one
docker volume prune                         # remove all unused volumes
```

Mount types when running a container directly:

```bash
docker run -v mydata:/var/lib/postgresql/data postgres:16   # named volume
docker run -v "$PWD/conf:/etc/conf:ro" nginx                # bind mount (read-only)
docker run --tmpfs /tmp alpine                              # in-memory tmpfs
```

### Backup / restore a named volume

```bash
# Back up postgres-data to a tarball in the current dir
docker run --rm -v integration-system_postgres-data:/data -v "$PWD:/backup" \
  alpine tar czf /backup/pg-backup.tar.gz -C /data .

# Restore it
docker run --rm -v integration-system_postgres-data:/data -v "$PWD:/backup" \
  alpine sh -c "cd /data && tar xzf /backup/pg-backup.tar.gz"
```

> Prefer a logical DB dump for Postgres backups when you can:
> `docker compose exec postgres pg_dump -U postgres amr_integration > dump.sql`.

## Networks

Compose creates a default network where services reach each other **by service
name** (e.g. FastAPI connects to `postgres:5432` and `mosquitto:1883`, not
`localhost`). That's why the compose env vars use service names as hosts.

```bash
docker network ls                           # list networks
docker network inspect integration-system_default
docker network create mynet                 # create a user-defined network
docker network connect mynet api            # attach a container
docker network disconnect mynet api
docker network prune                        # remove unused networks
```

### Name resolution rule of thumb

- **Container → container:** use the **service name** (`postgres`, `mosquitto`,
  `fastapi`). They share the compose network.
- **Browser/host → container:** use `localhost:<published-port>`. The frontend
  bundle talks to `localhost:8000`/`localhost:9001` because that code runs in
  *your browser*, outside the Docker network.
