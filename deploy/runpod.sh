#!/usr/bin/env bash
# Deploy BEP Bench on a RunPod pod.
#
# Run it on the pod:
#   curl -fsSL https://raw.githubusercontent.com/mac999/bepbench/main/deploy/runpod.sh | bash
# or, if the repo is already cloned:
#   bash deploy/runpod.sh
#
# Idempotent: safe to re-run to update the code and restart the service.
#
# Data lives on the persistent volume, so plans and uploaded models survive a
# pod restart. The app is served with basic authentication, because the RunPod
# HTTP proxy URL is reachable by anyone who has it and a BEP routinely carries
# information an appointing party has classified as sensitive.

set -euo pipefail

PORT="${BEP_PORT:-8080}"
REPO="${BEP_REPO:-https://github.com/mac999/bepbench.git}"
VOLUME="${BEP_VOLUME:-/workspace}"
APP_DIR="${BEP_APP_DIR:-$VOLUME/bepbench}"
DATA_DIR="${BEP_DATA_DIR:-$VOLUME/bep-data}"
VENV="${BEP_VENV:-$VOLUME/venv}"
ENV_FILE="$DATA_DIR/service.env"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- environment
say "Checking the environment"
[ -d "$VOLUME" ] || { echo "No volume at $VOLUME. Set BEP_VOLUME."; exit 1; }
command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git; }
PY="$(command -v python3)"
echo "    python  $("$PY" --version 2>&1)"
echo "    volume  $VOLUME  ($(df -h "$VOLUME" | awk 'NR==2{print $4" free of "$2}'))"

# A pod created without a network volume still has /workspace — as container
# disk, which is discarded when the pod is terminated.
if ! mountpoint -q "$VOLUME" 2>/dev/null; then
  warn "$VOLUME is container disk, not a mounted volume: plans and uploaded"
  warn "models will not survive terminating the pod. Export anything you keep."
fi

# Measured: the dependencies install to about 280 MB, of which ifcopenshell is
# 180 MB and numpy 57 MB. 1 GB leaves room for that, pip's build cache and a few
# uploaded models.
free_mb=$(df -Pm "$VOLUME" | awk 'NR==2{print $4}')
if [ "$free_mb" -lt 1024 ]; then
  warn "Only ${free_mb} MB free. The dependencies need about 280 MB installed and"
  warn "uploaded models go on top. Free some space or expect the install to fail."
fi

# ---------------------------------------------------------------------- code
if [ -d "$APP_DIR/.git" ]; then
  say "Updating the existing checkout"
  # Never discard work that is not on the remote. This script is also run by
  # hand against development checkouts, where a hard reset would silently throw
  # away uncommitted edits.
  if [ -n "$(git -C "$APP_DIR" status --porcelain)" ]; then
    warn "$APP_DIR has uncommitted changes; leaving the code untouched."
    warn "Commit or stash them, or point BEP_APP_DIR somewhere else, to update."
  else
    git -C "$APP_DIR" fetch --quiet origin
    git -C "$APP_DIR" reset --quiet --hard origin/main
  fi
elif [ -f "$APP_DIR/pyproject.toml" ]; then
  # Source copied in by other means (rsync, a volume snapshot). Use it as it is.
  say "Using the source already at $APP_DIR"
elif [ -e "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
  echo "$APP_DIR exists, is not a checkout, and holds no pyproject.toml." >&2
  echo "Move it aside or set BEP_APP_DIR to a free path." >&2
  exit 1
else
  say "Cloning $REPO"
  git clone --quiet --depth 1 "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"
if git rev-parse --git-dir >/dev/null 2>&1; then
  echo "    at $(git rev-parse --short HEAD) — $(git log -1 --format=%s)"
fi

# ------------------------------------------------------------------- packages
say "Installing dependencies (this is the slow step)"
# ifcopenshell's geometry kernel needs libgomp at runtime.
if ! ldconfig -p 2>/dev/null | grep -q libgomp; then
  apt-get update -qq && apt-get install -y -qq libgomp1
fi
# Install into a virtualenv. On Ubuntu 24.04 pip refuses to replace distro
# packages (Flask needs a newer blinker than Debian's, which has no RECORD
# file and so cannot be uninstalled), and --break-system-packages does not
# help. A venv avoids the argument entirely.
if [ ! -x "$VENV/bin/python" ]; then
  "$PY" -m venv --help >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq python3-venv; }
  "$PY" -m venv "$VENV"
fi
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -e ".[all]" gunicorn
echo "    venv    $VENV"

# ------------------------------------------------------------------ settings
mkdir -p "$DATA_DIR"
if [ ! -f "$ENV_FILE" ]; then
  say "Generating settings"
  # Written once and kept with the data, so a redeploy does not change the
  # password out from under whoever is already using it.
  {
    echo "BEP_DATA_DIR=$DATA_DIR"
    echo "SECRET_KEY=$("$VENV/bin/python" -c 'import secrets; print(secrets.token_hex(32))')"
    # BEP_NO_AUTH=1 serves the pod openly. Reasonable when the plans on it are
    # throwaway; the proxy URL is reachable by anyone who has it.
    if [ "${BEP_NO_AUTH:-0}" != "1" ]; then
      echo "BEP_AUTH_USER=${BEP_AUTH_USER:-bep}"
      echo "BEP_AUTH_PASSWORD=${BEP_AUTH_PASSWORD:-$("$VENV/bin/python" -c 'import secrets; print(secrets.token_urlsafe(18))')}"
    fi
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "    written to $ENV_FILE"
else
  echo "    reusing settings in $ENV_FILE"
  # An existing file is authoritative: someone may have turned auth off by hand.
  if [ "${BEP_NO_AUTH:-0}" = "1" ] && grep -q '^BEP_AUTH_USER=' "$ENV_FILE"; then
    sed -i '/^BEP_AUTH_USER=/d; /^BEP_AUTH_PASSWORD=/d' "$ENV_FILE"
    echo "    BEP_NO_AUTH=1 — removed the stored credentials"
  fi
fi
set -a; . "$ENV_FILE"; set +a

# --------------------------------------------------------------------- sample
if [ ! -f "$DATA_DIR/bep.sqlite3" ]; then
  say "Seeding a worked example"
  "$VENV/bin/bep" demo >/dev/null 2>&1 || true
  "$VENV/bin/bep" ifc import riverside-interchange-phase-2 "$APP_DIR/docs/demo/Duplex_A.ifc" \
      --discipline Architecture >/dev/null 2>&1 || warn "sample model not attached"
fi

# -------------------------------------------------------------------- service
say "Starting the service on port $PORT"
PID_FILE="$DATA_DIR/gunicorn.pid"
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  kill "$(cat "$PID_FILE")" && sleep 2
fi

# Something else on the port fails deep inside gunicorn with an unhelpful
# message. On a RunPod pod that something is usually JupyterLab on 8888.
if command -v curl >/dev/null && curl -fsS --max-time 2 "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
  echo "Port $PORT is already serving something else." >&2
  echo "Free it, or pick another with BEP_PORT=<port>." >&2
  echo "On a RunPod pod, port 8888 is JupyterLab: stop it first if you mean to replace it." >&2
  exit 1
fi

cat > "$DATA_DIR/start.sh" <<EOF
#!/usr/bin/env bash
# Start BEP Bench. Re-run this after a pod restart.
set -a; . "$ENV_FILE"; set +a
cd "$APP_DIR"
exec "$VENV/bin/gunicorn" --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 300 \\
  --pid "$PID_FILE" \\
  --access-logfile "$DATA_DIR/access.log" \\
  --error-logfile "$DATA_DIR/error.log" \\
  wsgi:app
EOF
chmod +x "$DATA_DIR/start.sh"

# Survive a pod restart. The template's /start.sh runs /pre_start.sh if it
# exists, so that is the hook — but it runs *before* sshd, so anything slow
# there delays SSH and can leave the pod unreachable. The hook therefore only
# detaches a helper and returns.
cat > "$DATA_DIR/autostart.sh" <<EOF
#!/usr/bin/env bash
# Bring BEP Bench up after the container starts.
exec >>"$DATA_DIR/autostart.log" 2>&1
echo "=== \$(date -Is) autostart ==="
EOF
if [ "$PORT" = "8888" ]; then
  # The template starts JupyterLab on 8888 after this hook has run, so wait for
  # it to appear and take the port back rather than racing something that does
  # not exist yet.
  cat >> "$DATA_DIR/autostart.sh" <<EOF
for _ in \$(seq 1 30); do pgrep -f jupyter-lab >/dev/null && break; sleep 1; done
pkill -f jupyter-lab 2>/dev/null && echo "stopped JupyterLab"
for _ in \$(seq 1 20); do ss -ltn 2>/dev/null | grep -q ":$PORT " || break; sleep 1; done
EOF
fi
cat >> "$DATA_DIR/autostart.sh" <<EOF
echo "starting bepbench"
exec "$DATA_DIR/start.sh"
EOF
chmod +x "$DATA_DIR/autostart.sh"

if [ -w / ]; then
  cat > /pre_start.sh <<EOF
#!/usr/bin/env bash
# Pod template hook. Runs before sshd, so it must return at once.
setsid nohup "$DATA_DIR/autostart.sh" </dev/null >/dev/null 2>&1 &
exit 0
EOF
  chmod +x /pre_start.sh
  echo "    autostart installed at /pre_start.sh"
else
  warn "cannot write /pre_start.sh; the service will not come back after a restart."
  warn "Start it by hand with $DATA_DIR/start.sh"
fi

nohup "$DATA_DIR/start.sh" >/dev/null 2>&1 &
for _ in $(seq 1 30); do
  sleep 1
  if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
    break
  fi
done

# ---------------------------------------------------------------------- report
say "Result"
if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
  echo "    service     up on port $PORT"
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/")
  if grep -q '^BEP_AUTH_USER=' "$ENV_FILE"; then
    echo "    auth        on — / returns $code without credentials (401 expected)"
  else
    echo "    auth        off — / returns $code to anyone (200 expected)"
  fi
  echo "    data        $DATA_DIR"
  echo "    restart     $DATA_DIR/start.sh"
  echo "    logs        $DATA_DIR/{access,error}.log"
  echo
  echo
  echo "    Open  https://<POD_ID>-$PORT.proxy.runpod.net"
  if grep -q '^BEP_AUTH_USER=' "$ENV_FILE"; then
    echo "    User  $(grep '^BEP_AUTH_USER=' "$ENV_FILE" | cut -d= -f2)"
    echo "    Password is in $ENV_FILE — read it there, do not paste it around:"
    echo "        grep BEP_AUTH_PASSWORD $ENV_FILE"
  else
    echo "    No authentication: anyone with that URL can read and edit the plans."
  fi
else
  echo "    service failed to start. Last errors:"
  tail -20 "$DATA_DIR/error.log" 2>/dev/null || echo "    (no log written)"
  exit 1
fi
