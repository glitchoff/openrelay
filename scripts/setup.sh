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
pkg install -y python openssh sshpass lsof

echo -e "${YELLOW}▶ Installing Python websockets...${NC}"
pip install websockets

# --- Create bridge directory ---
BRIDGE_DIR="$HOME/.opendeck"
mkdir -p "$BRIDGE_DIR"

# --- Write the bridge script ---
cat > "$BRIDGE_DIR/bridge.py" << 'PYEOF'
#!/data/data/com.termux/files/usr/bin/env python3
import asyncio, json, os, pty, struct, fcntl, termios, signal, sys, subprocess

WEBSOCKET_PORT = int(os.environ.get("OPENDECK_PORT", "8080"))
SSH_TARGET = os.environ.get("OPENDECK_SSH_TARGET", "")
SSH_PORT = int(os.environ.get("OPENDECK_SSH_PORT", "22"))
SSHPASS = os.environ.get("SSHPASS", "")

def set_winsize(fd, rows, cols):
    winsize = struct.pack("HHHH", rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

async def run_ssh_command(target, port, cmd):
    use_sshpass = bool(os.environ.get("SSHPASS"))
    if use_sshpass:
        ssh_cmd = ["sshpass", "-e", "ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "LogLevel=ERROR", "-p", str(port), target, cmd]
    else:
        ssh_cmd = ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "LogLevel=ERROR", "-p", str(port), target, cmd]
    proc = await asyncio.create_subprocess_exec(*ssh_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = await proc.communicate()
    return stdout.decode('utf-8', errors='replace'), stderr.decode('utf-8', errors='replace')

async def proxy_ssh(websocket, target, port):
    use_sshpass = bool(os.environ.get("SSHPASS"))
    if use_sshpass:
        ssh_cmd = ["sshpass", "-e", "ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "LogLevel=ERROR", "-o", "ServerAliveInterval=30", "-p", str(port), "-t", "-t", target]
    else:
        ssh_cmd = ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "LogLevel=ERROR", "-o", "ServerAliveInterval=30", "-p", str(port), "-t", "-t", target]

    master_fd, slave_fd = pty.openpty()
    proc = await asyncio.create_subprocess_exec(*ssh_cmd, stdin=slave_fd, stdout=slave_fd, stderr=slave_fd, preexec_fn=os.setsid)
    os.close(slave_fd)
    set_winsize(master_fd, 24, 80)
    loop = asyncio.get_event_loop()

    async def read_pty():
        while True:
            try:
                data = await loop.run_in_executor(None, os.read, master_fd, 4096)
            except OSError: break
            if not data: break
            try:
                await websocket.send(json.dumps({"type": "stdout", "data": data.decode("utf-8", errors="replace")}))
            except Exception: break

    async def write_pty():
        try:
            async for message in websocket:
                msg = json.loads(message)
                t = msg.get("type")
                if t == "stdin": os.write(master_fd, msg["data"].encode("utf-8"))
                elif t == "resize": set_winsize(master_fd, msg["rows"], msg["cols"])
                elif t == "list_dir":
                    path = msg["path"]
                    python_cmd = (
                        f"import os, json; "
                        f"path = os.path.expanduser({repr(path)}); "
                        f"res = []; "
                        f"try: "
                        f"  for name in os.listdir(path): "
                        f"    try: "
                        f"      full = os.path.join(path, name); "
                        f"      is_dir = os.path.isdir(full); "
                        f"      is_link = os.path.islink(full); "
                        f"      size = os.path.getsize(full) if not is_dir else 0; "
                        f"      res.append({{'name': name, 'is_dir': is_dir, 'is_symlink': is_link, 'size': size}}); "
                        f"    except: pass; "
                        f"  print(json.dumps({{'status': 'success', 'entries': res}})); "
                        f"except Exception as err: "
                        f"  print(json.dumps({{'status': 'error', 'message': str(err)}}));"
                    )
                    stdout, stderr = await run_ssh_command(target, port, f"python3 -c {repr(python_cmd)}")
                    try:
                        data = json.loads(stdout.strip())
                        if data.get("status") == "success":
                            await websocket.send(json.dumps({"type": "list_dir_result", "path": path, "entries": data["entries"]}))
                            continue
                    except: pass
                    stdout, _ = await run_ssh_command(target, port, f"python -c {repr(python_cmd)}")
                    try:
                        data = json.loads(stdout.strip())
                        if data.get("status") == "success":
                            await websocket.send(json.dumps({"type": "list_dir_result", "path": path, "entries": data["entries"]}))
                            continue
                    except: pass
                    await websocket.send(json.dumps({"type": "error", "path": path, "message": f"Failed to list directory: {stdout or stderr}"}))
                elif t == "read_file":
                    path = msg["path"]
                    python_cmd = (
                        f"import sys, base64; "
                        f"path = os.path.expanduser({repr(path)}); "
                        f"try: "
                        f"  with open(path, 'rb') as f: "
                        f"    print(base64.b64encode(f.read()).decode('utf-8')); "
                        f"except Exception as err: "
                        f"  print('ERROR:' + str(err));"
                    )
                    stdout, stderr = await run_ssh_command(target, port, f"python3 -c {repr(python_cmd)}")
                    output = stdout.strip()
                    if output.startswith("ERROR:"):
                        await websocket.send(json.dumps({"type": "error", "path": path, "message": output[6:]}))
                        continue
                    if output:
                        try:
                            import base64
                            content = base64.b64decode(output).decode('utf-8', errors='replace')
                            await websocket.send(json.dumps({"type": "read_file_result", "path": path, "content": content}))
                            continue
                        except: pass
                    stdout, _ = await run_ssh_command(target, port, f"python -c {repr(python_cmd)}")
                    output = stdout.strip()
                    if output.startswith("ERROR:"):
                        await websocket.send(json.dumps({"type": "error", "path": path, "message": output[6:]}))
                    else:
                        try:
                            import base64
                            content = base64.b64decode(output).decode('utf-8', errors='replace')
                            await websocket.send(json.dumps({"type": "read_file_result", "path": path, "content": content}))
                        except Exception as err:
                            await websocket.send(json.dumps({"type": "error", "path": path, "message": f"Failed to read file: {stdout or stderr or str(err)}"}))
                elif t == "write_file":
                    path = msg["path"]
                    content = msg["content"]
                    import base64
                    content_b64 = base64.b64encode(content.encode('utf-8')).decode('utf-8')
                    python_cmd = (
                        f"import base64; "
                        f"path = os.path.expanduser({repr(path)}); "
                        f"content = base64.b64decode({repr(content_b64)}); "
                        f"try: "
                        f"  with open(path, 'wb') as f: "
                        f"    f.write(content); "
                        f"  print('SUCCESS'); "
                        f"except Exception as err: "
                        f"  print('ERROR:' + str(err));"
                    )
                    stdout, stderr = await run_ssh_command(target, port, f"python3 -c {repr(python_cmd)}")
                    output = stdout.strip()
                    if output == "SUCCESS":
                        await websocket.send(json.dumps({"type": "write_file_result", "path": path, "success": True}))
                        continue
                    stdout, _ = await run_ssh_command(target, port, f"python -c {repr(python_cmd)}")
                    output = stdout.strip()
                    if output == "SUCCESS":
                        await websocket.send(json.dumps({"type": "write_file_result", "path": path, "success": True}))
                    else:
                        await websocket.send(json.dumps({"type": "error", "path": path, "message": f"Failed to write file: {stdout or stderr or output}"}))
                elif t == "disconnect": break
        except Exception: pass

    try:
        await asyncio.gather(read_pty(), write_pty())
    finally:
        try: os.killpg(os.getpgid(proc.pid), signal.SIGHUP)
        except: pass
        try: os.close(master_fd)
        except: pass
        try: await proc.wait()
        except: pass

async def handler(websocket):
    try:
        raw = await websocket.recv()
        msg = json.loads(raw)
        if msg.get("type") != "connect":
            await websocket.send(json.dumps({"type": "error", "message": "First message must be connect"}))
            return
        target = msg.get("target", SSH_TARGET)
        port = int(msg.get("port", SSH_PORT))
        if msg.get("password"): os.environ["SSHPASS"] = msg["password"]
        if not target:
            await websocket.send(json.dumps({"type": "error", "message": "No SSH target configured"}))
            return
        await websocket.send(json.dumps({"type": "connected", "host": target, "port": port}))
        await proxy_ssh(websocket, target, port)
    except Exception as e:
        try: await websocket.send(json.dumps({"type": "error", "message": str(e)}))
        except: pass

async def main():
    try:
        import websockets
    except ImportError:
        print("[*] Installing websockets...", flush=True)
        subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets"])
        import websockets
    print()
    print("  \033[1m\033[38;5;208m🔥 OpenDeck Bridge\033[0m")
    print("  \033[2m─────────────────────\033[0m")
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
