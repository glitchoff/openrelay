#!/data/data/com.termux/files/usr/bin/bash
#
# OpenRelay Setup — run this in Termux to install & start the bridge
#
# Usage: bash <(curl -sL https://raw.githubusercontent.com/glitchoff/openrelay/refs/heads/master/scripts/setup.sh)
# Or:    curl -sL https://raw.githubusercontent.com/glitchoff/openrelay/refs/heads/master/scripts/setup.sh -o setup.sh && bash setup.sh
#

set -e

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
RED='\033[0;31m'
NC='\033[0m'

VERSION="1.2.0"
BRIDGE_DIR="$HOME/.openrelay"
CONFIG_FILE="$BRIDGE_DIR/config.sh"

echo -e "${YELLOW}"
echo "   ____                   ____      __             "
echo "  / __ \____  ___  ____  / __ \___ / /___ ___  __  "
echo " / / / / __ \/ _ \/ __ \/ /_/ / _ \/ / __ \`/ / / /  "
echo "/ /_/ / /_/ /  __/ / / / _, _/  __/ / /_/ /_/ / /   "
echo "\____/ .___/\___/_/ /_/_/ |_|\___/_/_/\__,_/\__, /    "
echo "    /_/                                    /____/    "
echo -e "${NC}"
echo -e "${BOLD}  🔥 OpenRelay Bridge Setup v${VERSION}${NC}"
echo -e "${DIM}  ──────────────────────────────────────────${NC}"
echo ""

# --- Always read from terminal, even when piped ---
exec < /dev/tty

# --- Load previous configuration if exists ---
PREV_TARGET=""
PREV_PORT="22"
PREV_PASSWORD=""
if [ -f "$CONFIG_FILE" ]; then
    PREV_TARGET=$(grep "export OPENRELAY_SSH_TARGET=" "$CONFIG_FILE" | cut -d'"' -f2)
    PREV_PORT=$(grep "export OPENRELAY_SSH_PORT=" "$CONFIG_FILE" | cut -d'"' -f2)
    PREV_PASSWORD=$(grep "export SSHPASS=" "$CONFIG_FILE" | cut -d'"' -f2)
fi

TARGET=""
PORT=""
PASSWORD=""

if [ -n "$PREV_TARGET" ]; then
    echo -e "${YELLOW}Found previous configuration:${NC}"
    echo -e "  SSH Target: ${BLUE}$PREV_TARGET${NC}"
    echo -e "  SSH Port:   ${BLUE}$PREV_PORT${NC}"
    echo ""
    read -p "$(echo -e "${BLUE}?${NC} Use this configuration? (y/n) [y]: ")" USE_PREV
    USE_PREV=${USE_PREV:-y}
    if [ "$USE_PREV" = "y" ] || [ "$USE_PREV" = "Y" ]; then
        TARGET="$PREV_TARGET"
        PORT="$PREV_PORT"
        PASSWORD="$PREV_PASSWORD"
    fi
    echo ""
fi

# --- Get SSH target normally if not using previous ---
if [ -z "$TARGET" ]; then
    read -p "$(echo -e "${BLUE}?${NC} SSH target ${DIM}(user@host)${NC}: ")" TARGET
    read -sp "$(echo -e "${BLUE}?${NC} SSH password ${DIM}(or blank for key auth)${NC}: ")" PASSWORD
    echo ""
    read -p "$(echo -e "${BLUE}?${NC} SSH port ${DIM}[22]${NC}: ")" PORT
    PORT=${PORT:-22}
fi

echo ""
echo -e "${YELLOW}▶ Installing dependencies...${NC}"

pkg update -y -q
pkg install -y python openssh sshpass lsof python-cryptography

echo -e "${YELLOW}▶ Installing Python websockets...${NC}"
pip install websockets

# --- Create bridge directory ---
BRIDGE_DIR="$HOME/.openrelay"
mkdir -p "$BRIDGE_DIR"
mkdir -p "$BRIDGE_DIR/sockets"

# --- Write the bridge script ---
cat > "$BRIDGE_DIR/bridge.py" << 'PYEOF'
#!/data/data/com.termux/files/usr/bin/env python3
import asyncio
import json
import os
import sys
import subprocess
import base64

WEBSOCKET_PORT = int(os.environ.get("OPENRELAY_PORT", "8080"))
SSH_TARGET = os.environ.get("OPENRELAY_SSH_TARGET", "")
SSH_PORT = int(os.environ.get("OPENRELAY_SSH_PORT", "22"))
SSHPASS = os.environ.get("SSHPASS", "")

SOCKET_DIR = os.path.expanduser("~/.openrelay/sockets")
os.makedirs(SOCKET_DIR, exist_ok=True)
SOCKET_PATH = os.path.join(SOCKET_DIR, "ssh_mux")

async def _ssh(cmd: str, input_data: bytes | None = None, timeout: int = 30) -> tuple[str, str, int]:
    """Run a command on the remote host via the SSH ControlMaster connection."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ssh", "-o", "ControlPath=" + SOCKET_PATH, "-o", "ConnectTimeout=10",
            SSH_TARGET, cmd,
            stdin=asyncio.subprocess.PIPE if input_data is not None else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(input_data), timeout=timeout
        )
        return stdout.decode("utf-8", errors="replace"), stderr.decode("utf-8", errors="replace"), proc.returncode
    except asyncio.TimeoutError:
        try: proc.kill()
        except: pass
        return "", "Command timed out", -1
    except Exception as e:
        return "", str(e), -1

# ── Command builders (POSIX vs PowerShell) ──────────────────────
def _posix_path(path: str) -> str:
    """Replace leading ~ with $HOME so bash expands inside double quotes."""
    if path.startswith('~/'):
        return '$HOME/' + path[2:]
    if path == '~':
        return '$HOME'
    return path

def _ps_path(path: str) -> str:
    """Escape and wrap for PowerShell, with inline ~→$env:USERPROFILE and /→\\."""
    escaped = path.replace("'", "''").replace("/", "\\")
    return f"$p='{escaped}';if($p[0]-eq'~'){{$p=$env:USERPROFILE+$p.Substring(1)}}"

def build_list_dir(path: str, is_windows: bool) -> str:
    if is_windows:
        prefix = _ps_path(path)
        return (f"{prefix};Get-ChildItem -Path $p -Force | "
                f"ForEach-Object {{ \"$(if($_.PSIsContainer){{'d'}}else{{'f'}})`t$($_.Length)`t$($_.Name)\" }}")
    p = _posix_path(path)
    return (f"cd \"{p}\" 2>/dev/null; "
            f"for e in * .*; do "
            f"[ \"$e\" = \".\" -o \"$e\" = \"..\" ] && continue; "
            f"if [ -L \"$e\" ]; then t=l; s=0; "
            f"elif [ -d \"$e\" ]; then t=d; s=0; "
            f"else s=$(wc -c < \"$e\" 2>/dev/null||echo 0); t=f; fi; "
            f"printf '%s\\t%s\\t%s\\n' \"$t\" \"$s\" \"$e\"; done")

def build_read_file(path: str, is_windows: bool) -> str:
    if is_windows:
        prefix = _ps_path(path)
        return f"{prefix};[Convert]::ToBase64String([IO.File]::ReadAllBytes($p))"
    p = _posix_path(path)
    return f"base64 < \"{p}\""

def build_write_file(path: str, is_windows: bool) -> str:
    if is_windows:
        prefix = _ps_path(path)
        return f"{prefix};[Convert]::FromBase64String([Console]::In.ReadToEnd())|ForEach-Object{{[IO.File]::WriteAllBytes($p,$_)}}"
    p = _posix_path(path)
    return f"base64 -d > \"{p}\""

async def handler(websocket):
    proc = None
    try:
        raw = await websocket.recv()
        msg = json.loads(raw)
        if msg.get("type") != "connect":
            await websocket.send(json.dumps({"type": "error", "message": "First message must be connect"}))
            return

        # Always delete old socket to force fresh auth
        if os.path.exists(SOCKET_PATH):
            try: os.remove(SOCKET_PATH)
            except: pass

        await websocket.send(json.dumps({"type": "connecting", "host": SSH_TARGET, "port": SSH_PORT}))

        password = msg.get("password", SSHPASS)
        tmpfile = None
        cmd = []
        if password:
            tmpfile = os.path.join(SOCKET_DIR, f"sshpass_{os.getpid()}")
            with open(tmpfile, "w") as f:
                f.write(password)
            os.chmod(tmpfile, 0o600)
            cmd += ["sshpass", "-f", tmpfile]

        cmd += [
            "ssh", "-M", "-S", SOCKET_PATH, 
            "-p", str(SSH_PORT), 
            "-N", "-f", 
            "-o", "ControlPersist=10m", 
            "-o", "StrictHostKeyChecking=no", 
            SSH_TARGET
        ]

        p = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await p.communicate()

        # Clean up temp password file
        if tmpfile and os.path.exists(tmpfile):
            try: os.remove(tmpfile)
            except: pass

        if p.returncode != 0:
            err = stderr.decode("utf-8")
            # Remove stale socket so retry works
            if os.path.exists(SOCKET_PATH):
                try: os.remove(SOCKET_PATH)
                except: pass
            await websocket.send(json.dumps({"type": "error", "message": f"SSH connection failed: {err}"}))
            return

        await websocket.send(json.dumps({"type": "connected", "host": SSH_TARGET, "port": SSH_PORT}))

        # Probe remote OS — uname exists on POSIX, fails on plain Windows
        _, _, probe_code = await _ssh("uname 2>&1")
        IS_WINDOWS = probe_code != 0

        # Spawn native ssh client as subprocess for the PTY shell
        proc = await asyncio.create_subprocess_exec(
            "ssh", "-o", "ControlPath=" + SOCKET_PATH, "-t", SSH_TARGET,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        async def read_pty():
            while True:
                try:
                    data = await proc.stdout.read(4096)
                    if not data: break
                    text = data.decode("utf-8", errors="replace")
                    await websocket.send(json.dumps({"type": "stdout", "data": text}))
                except Exception: break

        async def write_pty():
            try:
                async for message in websocket:
                    msg = json.loads(message)
                    t = msg.get("type")
                    req_id = msg.get("id", "")

                    if t == "stdin":
                        proc.stdin.write(msg["data"].encode("utf-8"))
                        await proc.stdin.drain()
                    elif t == "resize":
                        pass
                    elif t == "list_dir":
                        path = msg["path"]
                        stdout, stderr, code = await _ssh(build_list_dir(path, IS_WINDOWS))
                        if code == 0:
                            entries = []
                            for line in stdout.strip().split('\n'):
                                if not line: continue
                                parts = line.split('\t', 2)
                                if len(parts) < 3: continue
                                t, s, name = parts
                                entries.append({
                                    "name": name,
                                    "is_dir": t == 'd',
                                    "is_symlink": t == 'l',
                                    "size": int(s) if s.isdigit() else 0
                                })
                            await websocket.send(json.dumps({
                                "type": "list_dir_result",
                                "path": path,
                                "id": req_id,
                                "entries": entries
                            }))
                        else:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "path": path,
                                "id": req_id,
                                "message": f"Failed to list directory: {stderr or stdout}"
                            }))
                    elif t == "read_file":
                        path = msg["path"]
                        stdout, stderr, code = await _ssh(build_read_file(path, IS_WINDOWS))
                        output = stdout.strip()
                        if code == 0 and output:
                            await websocket.send(json.dumps({
                                "type": "read_file_result",
                                "path": path,
                                "id": req_id,
                                "content_b64": output
                            }))
                        else:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "path": path,
                                "id": req_id,
                                "message": f"Failed to read file: {stderr or 'Empty output'}"
                            }))
                    elif t == "write_file":
                        path = msg["path"]
                        content = msg["content"]
                        content_b64 = base64.b64encode(content.encode('utf-8')).decode('utf-8')
                        stdout, stderr, code = await _ssh(build_write_file(path, IS_WINDOWS), input_data=content_b64.encode())
                        if code == 0:
                            await websocket.send(json.dumps({
                                "type": "write_file_result",
                                "path": path,
                                "id": req_id,
                                "success": True
                            }))
                        else:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "path": path,
                                "id": req_id,
                                "message": f"Failed to write file: {stderr or stdout}"
                            }))
                    elif t == "disconnect": 
                        break
            except Exception: 
                pass

        await asyncio.gather(read_pty(), write_pty())
    except Exception as e:
        try: await websocket.send(json.dumps({"type": "error", "message": str(e)}))
        except: pass
    finally:
        # Clean up socket on disconnect
        if os.path.exists(SOCKET_PATH):
            try: subprocess.run(["ssh", "-O", "exit", "-S", SOCKET_PATH, SSH_TARGET], capture_output=True)
            except: pass
        if proc:
            try: proc.kill()
            except: pass

async def main():
    try:
        import websockets
    except ImportError:
        print("[*] Installing requirements...", flush=True)
        subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets"])
        import websockets
    print()
    print("  \033[1m\033[38;5;208m🔥 OpenRelay Bridge (Native OpenSSH ControlMaster)\033[0m")
    print("  \033[2m────────────────────────────────────────────────────\033[0m")
    print(f"  WebSocket: ws://127.0.0.1:{WEBSOCKET_PORT}")
    if SSH_TARGET:
        print(f"  SSH:       {SSH_TARGET} ({'password' if SSHPASS else 'key'})")
    else:
        print("  SSH:       <send target via PWA>")
    print()
    async with websockets.serve(handler, "127.0.0.1", WEBSOCKET_PORT):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
PYEOF

chmod +x "$BRIDGE_DIR/bridge.py"

# --- Write config ---
cat > "$BRIDGE_DIR/config.sh" << EOF
export OPENRELAY_PORT="8080"
export OPENRELAY_SSH_TARGET="$TARGET"
export OPENRELAY_SSH_PORT="$PORT"
export SSHPASS="$PASSWORD"
EOF

# --- Start bridge ---
echo ""
echo -e "${GREEN}▶ Starting bridge...${NC}"
echo ""

cd "$BRIDGE_DIR"

# Kill any existing bridge process using port 8080 or matching bridge.py
pkill -f bridge.py || true
if [ -f bridge.pid ]; then
    kill $(cat bridge.pid) 2>/dev/null || true
    rm bridge.pid
fi
if os_exists_socket=$(ls sockets/ssh_mux* 2>/dev/null); then
    # Exit existing multiplex socket connections
    ssh -O exit -S sockets/ssh_mux "$TARGET" 2>/dev/null || true
fi
if command -v lsof &>/dev/null; then
    lsof -t -i :8080 | xargs kill -9 2>/dev/null || true
fi
sleep 0.5

nohup env \
  OPENRELAY_PORT="8080" \
  OPENRELAY_SSH_TARGET="$TARGET" \
  OPENRELAY_SSH_PORT="$PORT" \
  SSHPASS="$PASSWORD" \
  python bridge.py > bridge.log 2>&1 &
BRIDGE_PID=$!
echo "$BRIDGE_PID" > bridge.pid

sleep 1.5

if kill -0 "$BRIDGE_PID" 2>/dev/null; then
    echo ""
    echo -e "${GREEN}  ✅ Bridge running${NC}"
    echo -e "  PID:     $BRIDGE_PID"
    echo -e "  SSH:     ${BLUE}$TARGET${NC}"
    echo -e "  Address: ${BLUE}ws://127.0.0.1:8080${NC}"
    echo ""
    echo -e "  ${DIM}Restart: cd ~/.openrelay && bash restart.sh${NC}"
    echo -e "  ${DIM}Stop:    kill $BRIDGE_PID${NC}"
    echo ""
    echo -e "  ${BOLD}Now open the PWA and connect!${NC}"
    echo ""
else
    echo -e "${RED}  ❌ Bridge failed to start. Check:${NC}"
    echo -e "  ${DIM}cat $BRIDGE_DIR/bridge.log${NC}"
    echo ""
fi

# Write a restart script
cat > "$BRIDGE_DIR/restart.sh" << 'RSEOF'
#!/data/data/com.termux/files/usr/bin/bash
cd ~/.openrelay
source config.sh
pkill -f bridge.py || true
if [ -f bridge.pid ]; then
    kill $(cat bridge.pid) 2>/dev/null || true
    rm bridge.pid
fi
if command -v lsof &>/dev/null; then
    lsof -t -i :8080 | xargs kill -9 2>/dev/null || true
fi
sleep 0.5
nohup env OPENRELAY_PORT="$OPENRELAY_PORT" OPENRELAY_SSH_TARGET="$OPENRELAY_SSH_TARGET" OPENRELAY_SSH_PORT="$OPENRELAY_SSH_PORT" SSHPASS="$SSHPASS" python bridge.py > bridge.log 2>&1 &
echo $! > bridge.pid
echo "Bridge restarted (PID: $(cat bridge.pid))"
RSEOF
chmod +x "$BRIDGE_DIR/restart.sh"
