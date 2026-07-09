#!/usr/bin/env python3
"""
local-bridge.py — OpenRelay local test bridge (Windows/Mac/Linux)

No SSH. Serves the local filesystem and spawns a local shell.
Same WebSocket protocol as the Termux bridge (setup.sh).

Usage:
    python scripts/local-bridge.py [--port 8080] [--host 127.0.0.1]

Requirements:
    pip install websockets
"""

import asyncio
import base64
import json
import os
import sys
import stat
import subprocess
import argparse

# Force UTF-8 output on Windows (avoids cp1252 UnicodeEncodeError)
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── try importing websockets, auto-install if missing ──────────────────────────
try:
    import websockets
except ImportError:
    print("[*] websockets not found, installing...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets"])
    import websockets

# ── config ─────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="OpenRelay local test bridge")
parser.add_argument("--port", type=int, default=8080)
parser.add_argument("--host", default="127.0.0.1")
args = parser.parse_args()

IS_WINDOWS = sys.platform == "win32"
SHELL_CMD  = ["powershell.exe", "-NoLogo", "-NoProfile"] if IS_WINDOWS else ["/bin/bash", "-i"]

# ── helpers ────────────────────────────────────────────────────────────────────
def expand(path: str) -> str:
    """Expand ~ and normalise separators."""
    return os.path.normpath(os.path.expanduser(path))

def list_dir_entries(path: str) -> list:
    entries = []
    with os.scandir(path) as it:
        for e in it:
            try:
                st = e.stat(follow_symlinks=False)
                is_link = e.is_symlink()
                is_dir  = e.is_dir(follow_symlinks=True)
                size    = st.st_size
            except OSError:
                is_link = False
                is_dir  = False
                size    = 0
            entries.append({
                "name":       e.name,
                "is_dir":     is_dir,
                "is_symlink": is_link,
                "size":       size,
            })
    return entries

# ── per-connection handler ─────────────────────────────────────────────────────
async def handler(websocket):
    ptys = {}
    pty_counter = -1  # first spawn yields id=0
    reader_tasks = []

    try:
        # ── handshake: wait for { type: "connect" } ────────────────────────
        try:
            raw = await asyncio.wait_for(websocket.recv(), timeout=30)
        except asyncio.TimeoutError:
            return

        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await websocket.send(json.dumps({
                "type": "error",
                "message": "Invalid JSON message",
            }))
            return

        if msg.get("type") != "connect":
            await websocket.send(json.dumps({
                "type": "error",
                "message": "First message must be connect",
            }))
            return

        # Send connecting message (protocol compat with setup.sh)
        await websocket.send(json.dumps({
            "type": "connecting",
            "host": "localhost",
            "port": args.port,
        }))

        await websocket.send(json.dumps({
            "type": "connected",
            "host": "localhost",
            "port": 0,
        }))

        # Parse cols/rows from connect message (protocol compat)
        cols = msg.get("cols", 80)
        rows = msg.get("rows", 24)
        try:
            cols = max(1, min(int(cols), 1000))
            rows = max(1, min(int(rows), 1000))
        except (TypeError, ValueError):
            cols, rows = 80, 24

        async def spawn_pty(cwd=None):
            nonlocal pty_counter
            if cwd and os.path.isdir(expand(cwd)):
                shell_cwd = expand(cwd)
            else:
                shell_cwd = os.getcwd()

            proc = await asyncio.create_subprocess_exec(
                *SHELL_CMD,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=shell_cwd,
            )
            pty_counter += 1
            new_id = pty_counter
            ptys[new_id] = proc

            # Attempt to set terminal size on supported platforms
            if not IS_WINDOWS:
                try:
                    proc.terminal_size(cols, rows)
                except Exception:
                    pass

            async def read_pty(pty_id):
                try:
                    while True:
                        data = await proc.stdout.read(8192)
                        if not data:
                            break
                        # On Windows, PowerShell outputs UTF-16LE when piped.
                        # Try UTF-8 first, then fall back to UTF-16LE for Windows.
                        try:
                            text = data.decode("utf-8")
                        except UnicodeDecodeError:
                            try:
                                text = data.decode("utf-16-le")
                            except UnicodeDecodeError:
                                text = data.decode("utf-8", errors="replace")
                        await websocket.send(json.dumps({
                            "type": "stdout",
                            "pty_id": pty_id,
                            "data": text,
                        }))
                except Exception:
                    pass
                finally:
                    ptys.pop(pty_id, None)
                    try:
                        proc.kill()
                    except Exception:
                        pass

            await websocket.send(json.dumps({
                "type": "pty_created",
                "pty_id": new_id,
            }))
            # Brief delay so client can wire the stdout callback before any data arrives
            await asyncio.sleep(0.05)
            task = asyncio.create_task(read_pty(new_id))
            reader_tasks.append(task)
            return new_id

        # ── pump WS messages → shell / fs ops ─────────────────────────────
        async def handle_messages():
            async for raw in websocket:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Invalid JSON message",
                    }))
                    continue

                t      = msg.get("type")
                req_id = msg.get("id", "")
                pty_id = msg.get("pty_id", 0)

                if t == "stdin":
                    proc = ptys.get(pty_id)
                    if proc and proc.stdin:
                        data = msg["data"]
                        # Shells expect \b (0x08) for backspace, not \x7f (DEL)
                        data = data.replace("\x7f", "\b")
                        proc.stdin.write(data.encode("utf-8", errors="replace"))
                        await proc.stdin.drain()

                elif t == "resize":
                    # Note: local subprocess has no PTY, so resize is best-effort
                    proc = ptys.get(pty_id)
                    if proc:
                        try:
                            proc.terminal_size(cols, rows)
                        except Exception:
                            pass

                elif t == "create_pty":
                    try:
                        await spawn_pty(msg.get("cwd"))
                    except Exception as err:
                        await websocket.send(json.dumps({
                            "type": "error",
                            "message": f"Failed to create PTY: {err}",
                        }))

                elif t == "close_pty":
                    pid = msg.get("pty_id")
                    if pid is not None:
                        proc = ptys.pop(pid, None)
                        if proc:
                            try:
                                proc.kill()
                            except Exception:
                                pass

                elif t == "list_dir":
                    path = msg.get("path", "")
                    try:
                        real = expand(path)
                        entries = list_dir_entries(real)
                        await websocket.send(json.dumps({
                            "type":    "list_dir_result",
                            "path":    path,
                            "id":      req_id,
                            "entries": entries,
                        }))
                    except Exception as err:
                        await websocket.send(json.dumps({
                            "type":    "error",
                            "path":    path,
                            "id":      req_id,
                            "message": f"Failed to list directory: {err}",
                        }))

                elif t == "read_file":
                    path = msg.get("path", "")
                    try:
                        real = expand(path)
                        with open(real, "rb") as f:
                            content = f.read()
                        content_b64 = base64.b64encode(content).decode("ascii")
                        await websocket.send(json.dumps({
                            "type":    "read_file_result",
                            "path":    path,
                            "id":      req_id,
                            "content_b64": content_b64,
                        }))
                    except Exception as err:
                        await websocket.send(json.dumps({
                            "type":    "error",
                            "path":    path,
                            "id":      req_id,
                            "message": f"Failed to read file: {err}",
                        }))

                elif t == "write_file":
                    path = msg.get("path", "")
                    try:
                        # Binary-safe: accept content_b64 or plain content
                        if isinstance(msg.get("content_b64"), str):
                            content = base64.b64decode(msg["content_b64"], validate=True)
                        elif isinstance(msg.get("content"), str):
                            content = msg["content"].encode("utf-8")
                        else:
                            raise ValueError("Missing file content")
                        real = expand(path)
                        with open(real, "wb") as f:
                            f.write(content)
                        await websocket.send(json.dumps({
                            "type":    "write_file_result",
                            "path":    path,
                            "id":      req_id,
                            "success": True,
                        }))
                    except Exception as err:
                        await websocket.send(json.dumps({
                            "type":    "error",
                            "path":    path,
                            "id":      req_id,
                            "message": f"Failed to write file: {err}",
                        }))

                elif t == "mkdir":
                    path = msg.get("path", "")
                    try:
                        real = expand(path)
                        os.makedirs(real, exist_ok=True)
                        await websocket.send(json.dumps({
                            "type":    "mkdir_result",
                            "path":    path,
                            "id":      req_id,
                            "success": True,
                        }))
                    except Exception as err:
                        await websocket.send(json.dumps({
                            "type":    "error",
                            "path":    path,
                            "id":      req_id,
                            "message": f"Failed to create directory: {err}",
                        }))

                elif t == "rename":
                    old_path = msg.get("old_path", "")
                    new_path = msg.get("new_path", "")
                    try:
                        os.rename(expand(old_path), expand(new_path))
                        await websocket.send(json.dumps({
                            "type":    "rename_result",
                            "old_path": old_path,
                            "new_path": new_path,
                            "id":      req_id,
                            "success": True,
                        }))
                    except Exception as err:
                        await websocket.send(json.dumps({
                            "type":    "error",
                            "path":    old_path,
                            "id":      req_id,
                            "message": f"Failed to rename: {err}",
                        }))

                elif t == "disconnect":
                    break

                else:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "id": req_id,
                        "message": f"Unknown message type: {t}",
                    }))

        # Initial shell cwd from connect message, if provided
        initial_cwd = msg.get("path") or msg.get("cwd")

        # Spawn initial PTY 0
        initial_pty_id = await spawn_pty(initial_cwd)

        await handle_messages()

    except Exception as e:
        try:
            await websocket.send(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass
    finally:
        for pid, proc in list(ptys.items()):
            try:
                proc.kill()
            except Exception:
                pass
        for task in reader_tasks:
            task.cancel()
        if reader_tasks:
            await asyncio.gather(*reader_tasks, return_exceptions=True)

# ── main ───────────────────────────────────────────────────────────────────────
async def main():
    shell_label = " ".join(SHELL_CMD)
    print()
    print("  [OpenRelay] LOCAL Bridge  (no SSH -- for testing)")
    print("  " + "-" * 40)
    print(f"  WebSocket : ws://{args.host}:{args.port}")
    print(f"  Shell     : {shell_label}")
    print(f"  Filesystem: local ({os.getcwd()})")
    print()
    print("  \033[2mPress Ctrl-C to stop\033[0m")
    print()

    async with websockets.serve(
        handler,
        args.host,
        args.port,
        ping_interval=20,
        ping_timeout=20,
        max_size=32 * 1024 * 1024,
    ):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n  Stopped.")
