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

echo ""
echo -e "${BOLD}  🔥 OpenDeck Bridge Setup${NC}"
echo -e "${DIM}  ──────────────────────────${NC}"
echo ""

# --- Always read from terminal, even when piped ---
exec < /dev/tty

# --- Get SSH target ---
read -p "$(echo -e "${BLUE}?${NC} SSH target ${DIM}(user@host)${NC}: ")" TARGET
read -sp "$(echo -e "${BLUE}?${NC} SSH password ${DIM}(or blank for key auth)${NC}: ")" PASSWORD
echo ""
read -p "$(echo -e "${BLUE}?${NC} SSH port ${DIM}[22]${NC}: ")" PORT
PORT=${PORT:-22}

echo ""
echo -e "${YELLOW}▶ Installing dependencies...${NC}"

pkg update -y -q
pkg install -y python openssh sshpass lsof python-cryptography

echo -e "${YELLOW}▶ Installing Python websockets and asyncssh...${NC}"
pip install websockets asyncssh

# --- Create bridge directory ---
BRIDGE_DIR="$HOME/.opendeck"
mkdir -p "$BRIDGE_DIR"

# --- Write the bridge script ---
cat > "$BRIDGE_DIR/bridge.py" << 'PYEOF'
#!/data/data/com.termux/files/usr/bin/env python3
import asyncio, json, os, sys, stat, subprocess

WEBSOCKET_PORT = int(os.environ.get("OPENDECK_PORT", "8080"))
SSH_TARGET = os.environ.get("OPENDECK_SSH_TARGET", "")
SSH_PORT = int(os.environ.get("OPENDECK_SSH_PORT", "22"))
SSHPASS = os.environ.get("SSHPASS", "")

async def handler(websocket):
    conn = None
    chan = None
    sftp = None
    try:
        raw = await websocket.recv()
        msg = json.loads(raw)
        if msg.get("type") != "connect":
            await websocket.send(json.dumps({"type": "error", "message": "First message must be connect"}))
            return
        target = msg.get("target", SSH_TARGET)
        port = int(msg.get("port", SSH_PORT))
        password = msg.get("password") or SSHPASS
        if not target:
            await websocket.send(json.dumps({"type": "error", "message": "No SSH target configured"}))
            return
        if "@" in target:
            username, host = target.split("@", 1)
        else:
            username, host = None, target

        await websocket.send(json.dumps({"type": "connecting", "host": host, "port": port}))

        import asyncssh
        try:
            conn = await asyncssh.connect(
                host,
                port=port,
                username=username,
                password=password or None,
                known_hosts=None
            )
        except Exception as e:
            await websocket.send(json.dumps({"type": "error", "message": f"SSH connection failed: {str(e)}"}))
            return

        await websocket.send(json.dumps({"type": "connected", "host": host, "port": port}))
        sftp = await conn.start_sftp_client()
        chan = await conn.create_subprocess(term_type="xterm-256color", term_size=(80, 24), encoding=None)

        async def read_pty():
            while True:
                try:
                    data = await chan.stdout.read(4096)
                    if not data: break
                    text = data.decode("utf-8", errors="replace")
                    await websocket.send(json.dumps({"type": "stdout", "data": text}))
                except Exception: break

        async def write_pty():
            try:
                async for message in websocket:
                    msg = json.loads(message)
                    t = msg.get("type")
                    if t == "stdin":
                        chan.stdin.write(msg["data"].encode("utf-8"))
                    elif t == "resize":
                        chan.change_terminal_size(msg["cols"], msg["rows"])
                    elif t == "list_dir":
                        path = msg["path"]
                        req_id = msg.get("id", "")
                        try:
                            expanded_path = path
                            if path.startswith("~"):
                                home = await sftp.realpath(".")
                                expanded_path = path.replace("~", home, 1)
                            attrs = await sftp.readdir(expanded_path)
                            entries = []
                            for attr in attrs:
                                if attr.filename in (".", ".."): continue
                                permissions = attr.attrs.permissions or 0
                                is_dir = stat.S_ISDIR(permissions)
                                is_link = stat.S_ISLNK(permissions)
                                size = attr.attrs.size or 0
                                entries.append({
                                    "name": attr.filename,
                                    "is_dir": is_dir,
                                    "is_symlink": is_link,
                                    "size": size
                                })
                            await websocket.send(json.dumps({
                                "type": "list_dir_result",
                                "path": path,
                                "id": req_id,
                                "entries": entries
                            }))
                        except Exception as err:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "path": path,
                                "id": req_id,
                                "message": f"Failed to list directory: {str(err)}"
                            }))
                    elif t == "read_file":
                        path = msg["path"]
                        req_id = msg.get("id", "")
                        try:
                            expanded_path = path
                            if path.startswith("~"):
                                home = await sftp.realpath(".")
                                expanded_path = path.replace("~", home, 1)
                            async with sftp.open(expanded_path, "r", encoding="utf-8", errors="replace") as f:
                                content = await f.read()
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
                        req_id = msg.get("id", "")
                        content = msg["content"]
                        try:
                            expanded_path = path
                            if path.startswith("~"):
                                home = await sftp.realpath(".")
                                expanded_path = path.replace("~", home, 1)
                            async with sftp.open(expanded_path, "w", encoding="utf-8") as f:
                                await f.write(content)
                            await websocket.send(json.dumps({
                                "type": "write_file_result",
                                "path": path,
                                "id": req_id,
                                "success": True
                            }))
                        except Exception as err:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "path": path,
                                "id": req_id,
                                "message": f"Failed to write file: {str(err)}"
                            }))
                    elif t == "disconnect": break
            except Exception: pass

        await asyncio.gather(read_pty(), write_pty())
    except Exception as e:
        try: await websocket.send(json.dumps({"type": "error", "message": str(e)}))
        except: pass
    finally:
        if chan:
            try: chan.close()
            except: pass
        if sftp:
            try: sftp.exit()
            except: pass
        if conn:
            try: conn.close()
            except: pass

async def main():
    try:
        import websockets
        import asyncssh
    except ImportError:
        print("[*] Installing requirements...", flush=True)
        subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets", "asyncssh"])
        import websockets
        import asyncssh
    print()
    print("  \033[1m\033[38;5;208m🔥 OpenDeck Bridge (SFTP Multiplexed)\033[0m")
    print("  \033[2m──────────────────────────────────────────\033[0m")
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
