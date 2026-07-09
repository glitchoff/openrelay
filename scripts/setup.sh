#!/data/data/com.termux/files/usr/bin/bash
#
# OpenDeck Setup — run this in Termux to install & start the bridge
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

VERSION="1.1.0"
BRIDGE_DIR="$HOME/.opendeck"
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
    PREV_TARGET=$(grep "export OPENDECK_SSH_TARGET=" "$CONFIG_FILE" | cut -d'"' -f2)
    PREV_PORT=$(grep "export OPENDECK_SSH_PORT=" "$CONFIG_FILE" | cut -d'"' -f2)
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
BRIDGE_DIR="$HOME/.opendeck"
mkdir -p "$BRIDGE_DIR"
mkdir -p "$BRIDGE_DIR/sockets"

# --- Write the bridge script ---
cat > "$BRIDGE_DIR/bridge.py" << 'PYEOF'
#!/data/data/com.termux/files/usr/bin/env python3
import asyncio
import json
import os
import sys
import stat
import subprocess
import base64

WEBSOCKET_PORT = int(os.environ.get("OPENDECK_PORT", "8080"))
SSH_TARGET = os.environ.get("OPENDECK_SSH_TARGET", "")
SSH_PORT = int(os.environ.get("OPENDECK_SSH_PORT", "22"))
SSHPASS = os.environ.get("SSHPASS", "")

SOCKET_DIR = os.path.expanduser("~/.opendeck/sockets")
os.makedirs(SOCKET_DIR, exist_ok=True)
SOCKET_PATH = os.path.join(SOCKET_DIR, "ssh_mux")

async def run_cmd_over_ssh(cmd: str) -> tuple[str, str, int]:
    """Runs a command over the multiplexed SSH connection."""
    proc = await asyncio.create_subprocess_exec(
        "ssh", "-o", "ControlPath=" + SOCKET_PATH, SSH_TARGET, cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    return stdout.decode("utf-8", errors="replace"), stderr.decode("utf-8", errors="replace"), proc.returncode

async def handler(websocket):
    proc = None
    try:
        raw = await websocket.recv()
        msg = json.loads(raw)
        if msg.get("type") != "connect":
            await websocket.send(json.dumps({"type": "error", "message": "First message must be connect"}))
            return

        # Start master connection in background if not already running
        if not os.path.exists(SOCKET_PATH):
            await websocket.send(json.dumps({"type": "connecting", "host": SSH_TARGET, "port": SSH_PORT}))
            
            cmd = []
            if SSHPASS:
                cmd += ["sshpass", "-p", SSHPASS]
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
            if p.returncode != 0:
                await websocket.send(json.dumps({"type": "error", "message": f"SSH connection failed: {stderr.decode('utf-8')}"}))
                return

        await websocket.send(json.dumps({"type": "connected", "host": SSH_TARGET, "port": SSH_PORT}))

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
                        python_cmd = (
                            f"import os, json, stat; "
                            f"path = os.path.expanduser({repr(path)}); "
                            f"res = []; "
                            f"try: "
                            f"  for name in os.listdir(path): "
                            f"    try: "
                            f"      full = os.path.join(path, name); "
                            f"      st = os.lstat(full); "
                            f"      is_dir = stat.S_ISDIR(st.st_mode); "
                            f"      is_link = stat.S_ISLNK(st.st_mode); "
                            f"      size = st.st_size if not is_dir else 0; "
                            f"      res.append({{'name': name, 'is_dir': is_dir, 'is_symlink': is_link, 'size': size}}); "
                            f"    except: pass; "
                            f"  print(json.dumps({{'status': 'success', 'entries': res}})); "
                            f"except Exception as err: "
                            f"  print(json.dumps({{'status': 'error', 'message': str(err)}}));"
                        )
                        
                        stdout, stderr, code = await run_cmd_over_ssh(f"python3 -c {repr(python_cmd)}")
                        try:
                            data = json.loads(stdout.strip())
                            if data.get("status") == "success":
                                await websocket.send(json.dumps({
                                    "type": "list_dir_result",
                                    "path": path,
                                    "id": req_id,
                                    "entries": data["entries"]
                                }))
                                continue
                        except: pass
                        await websocket.send(json.dumps({
                            "type": "error",
                            "path": path,
                            "id": req_id,
                            "message": f"Failed to list directory: {stdout or stderr}"
                        }))
                    elif t == "read_file":
                        path = msg["path"]
                        python_cmd = (
                            f"import os, base64; "
                            f"path = os.path.expanduser({repr(path)}); "
                            f"try: "
                            f"  with open(path, 'rb') as f: "
                            f"    print(base64.b64encode(f.read()).decode('utf-8')); "
                            f"except Exception as err: "
                            f"  print('ERROR:' + str(err));"
                        )
                        stdout, stderr, code = await run_cmd_over_ssh(f"python3 -c {repr(python_cmd)}")
                        output = stdout.strip()
                        if output.startswith("ERROR:"):
                            await websocket.send(json.dumps({
                                "type": "error",
                                "path": path,
                                "id": req_id,
                                "message": output[6:]
                            }))
                        else:
                            try:
                                content = base64.b64decode(output).decode('utf-8', errors='replace')
                                await websocket.send(json.dumps({
                                    "type": "read_file_result",
                                    "path": path,
                                    "id": req_id,
                                    "content": content
                                }))
                            except Exception as err:
                                await websocket.send(json.dumps({
                                    "type": "error",
                                    "path": path,
                                    "id": req_id,
                                    "message": f"Failed to read file: {str(err)}"
                                }))
                    elif t == "write_file":
                        path = msg["path"]
                        content = msg["content"]
                        content_b64 = base64.b64encode(content.encode('utf-8')).decode('utf-8')
                        python_cmd = (
                            f"import os, base64; "
                            f"path = os.path.expanduser({repr(path)}); "
                            f"content = base64.b64decode({repr(content_b64)}); "
                            f"try: "
                            f"  with open(path, 'wb') as f: "
                            f"    f.write(content); "
                            f"  print('SUCCESS'); "
                            f"except Exception as err: "
                            f"  print('ERROR:' + str(err));"
                        )
                        stdout, stderr, code = await run_cmd_over_ssh(f"python3 -c {repr(python_cmd)}")
                        output = stdout.strip()
                        if output == "SUCCESS":
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
                                "message": f"Failed to write file: {stdout or stderr or output}"
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
export OPENDECK_PORT="8080"
export OPENDECK_SSH_TARGET="$TARGET"
export OPENDECK_SSH_PORT="$PORT"
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
  OPENDECK_PORT="8080" \
  OPENDECK_SSH_TARGET="$TARGET" \
  OPENDECK_SSH_PORT="$PORT" \
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
    echo -e "  ${DIM}Restart: cd ~/.opendeck && bash restart.sh${NC}"
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
cd ~/.opendeck
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
nohup env OPENDECK_PORT="$OPENDECK_PORT" OPENDECK_SSH_TARGET="$OPENDECK_SSH_TARGET" OPENDECK_SSH_PORT="$OPENDECK_SSH_PORT" SSHPASS="$SSHPASS" python bridge.py > bridge.log 2>&1 &
echo $! > bridge.pid
echo "Bridge restarted (PID: $(cat bridge.pid))"
RSEOF
chmod +x "$BRIDGE_DIR/restart.sh"
