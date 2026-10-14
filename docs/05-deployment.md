# Deployment

## Local

```bash
pip install -e .            # or: pip install -r requirements.txt
bep serve --port 8080       # http://127.0.0.1:8080
```

Data lands in `$BEP_DATA_DIR`, or `/data` when it exists and is writable, or
`~/.local/share/bep`. That directory holds `bep.sqlite3`, the uploaded IFC files and their
derived viewer payloads under `models/`.

## Fly.io

```bash
fly launch --no-deploy --copy-config          # the app name must be free on Fly
fly volumes create bep_data --size 3 --region iad
fly secrets set SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
fly deploy
```

`fly.toml` mounts the volume at `/data`, health-checks `/healthz`, and suspends the machine
when idle (`auto_stop_machines = "suspend"`, `min_machines_running = 0`), so an occasional-use
instance costs close to nothing and wakes on the next request.

**Sizing.** The default is `shared-cpu-1x` with 1 GB, because IFC tessellation is the memory
peak, not request serving. A 200 MB IFC wants 2 GB. Size the volume for the models you expect
to keep, not just the database.

**Workers.** The container runs one gunicorn worker with eight threads. That is deliberate:
SQLite takes a single writer, and threads carry the concurrency an authoring tool actually
sees. To run more workers, move to Postgres with `DATABASE_URL` — the models are plain
SQLAlchemy and need no other change.

**AI in the cloud.** Ollama is not in the image. Either leave AI off — the panel reports that
no model is reachable and everything else works — or point it at a model endpoint you control:

```bash
fly secrets set BEP_CONFIG=/data/config.json
# then write /data/config.json with {"ai": {"base_url": "...", "model": "..."}}
```

Think before doing that: the prompt carries the plan's contents, and a BEP for a sensitive
asset should not leave your own infrastructure.

## RunPod

```bash
# on the pod
curl -fsSL https://raw.githubusercontent.com/mac999/bepbench/main/deploy/runpod.sh | bash
```

The script clones to `/workspace/bepbench`, installs the optional extras, puts the
database and uploaded models on the persistent volume at `/workspace/bep-data`, and starts
gunicorn on port 8080. Re-running it updates the code and restarts the service; it refuses
to touch a checkout with uncommitted changes.

Expose port **8080** under *Expose HTTP Ports* when creating the pod — RunPod fixes the
HTTP port list at creation time, so adding one later means a new pod.

**The proxy URL is public.** Anyone holding `https://<pod-id>-8080.proxy.runpod.net` can
reach the service, so the script generates a password and turns on basic authentication.
It is written once to `/workspace/bep-data/service.env` and reused on redeploy. Read it
with `grep BEP_AUTH_PASSWORD /workspace/bep-data/service.env`.

After a pod restart the container starts fresh: run `/workspace/bep-data/start.sh` to bring
the service back. The data is already on the volume.

## Any other host

The image is an ordinary Python web app:

```bash
docker build -t bepbench .
docker run -p 8080:8080 -v bep-data:/data -e SECRET_KEY=... bepbench
```

`libgomp1` is installed for ifcopenshell's geometry kernel; without it IFC upload fails and
everything else keeps working.

## Operations

| Task | Command |
| --- | --- |
| Health check | `GET /healthz` |
| Score every plan | `bep list` |
| Gate a submission in CI | `bep score <plan> --require-ready --fail-under 70` |
| Back up | Copy `$BEP_DATA_DIR`, or `bep export <plan> --format json` per plan |
| Check the effective settings | `bep config` |
| Check the model endpoint | `bep ai status` |
