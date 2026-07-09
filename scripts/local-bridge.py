#!/usr/bin/env python3
"""
local-bridge.py — OpenRelay local test bridge (Windows/Mac/Linux)

No SSH. Serves the local filesystem and spawns a local shell.
Same WebSocket protocol as the Termux bridge.

Usage:
    python scripts/local-bridge.py [--port 8080] [--host 127.0.0.1]

Requirements:
    pip install websockets
"""

import asyncio
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
    pty_counter = 0
    reader_tasks = []

    try:
        # ── handshake: wait for { type: "connect" } ────────────────────────
        raw = await websocket.recv()
        msg = json.loads(raw)
        if msg.get("type") != "connect":
            await websocket.send(json.dumps({
                "type": "error",
                "message": "First message must be { type: 'connect' }"
            }))
            return

        await websocket.send(json.dumps({
            "type": "connected",
            "host": "localhost",
            "port": 0,
        }))

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

            async def read_pty(pty_id):
                try:
                    while True:
                        data = await proc.stdout.read(4096)
                        if not data:
                            break
                        await websocket.send(json.dumps({
                            "type": "stdout",
                            "pty_id": pty_id,
                            "data": data.decode("utf-8", errors="replace"),
                        }))
                except Exception:
                    pass
                finally:
                    ptys.pop(pty_id, None)
                    try:
                        proc.kill()
                    except Exception:
                        pass

            task = asyncio.create_task(read_pty(new_id))
            reader_tasks.append(task)
            await websocket.send(json.dumps({
                "type": "pty_created",
                "pty_id": new_id,
            }))
            return new_id

        # ── spawn initial local shell (id=0) ───────────────────────────────
        first_cwd = os.getcwd()
        proc0 = await asyncio.create_subprocess_exec(
            *SHELL_CMD,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=first_cwd,
        )
        ptys[0] = proc0

        async def read_pty0():
            try:
                while True:
                    data = await proc0.stdout.read(4096)
                    if not data:
                        break
                    await websocket.send(json.dumps({
                        "type": "stdout",
                        "pty_id": 0,
                        "data": data.decode("utf-8", errors="replace"),
                    }))
            except Exception:
                pass
            finally:
                ptys.pop(0, None)
                try:
                    proc0.kill()
                except Exception:
                    pass

        reader_tasks.append(asyncio.create_task(read_pty0()))

        # ── pump WS messages → shell / fs ops ─────────────────────────────
        async def handle_messages():
            async for raw in websocket:
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue

                t      = msg.get("type")
                req_id = msg.get("id", "")
                pty_id = msg.get("pty_id", 0)

                if t == "stdin":
                    proc = ptys.get(pty_id)
                    if proc and proc.stdin:
                        proc.stdin.write(msg["data"].encode("utf-8"))
                        await proc.stdin.drain()

                elif t == "resize":
                    pass

                elif t == "create_pty":
                    await spawn_pty(msg.get("cwd"))

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
                            "message": f"list_dir failed: {err}",
                        }))

                elif t == "read_file":
                    path = msg.get("path", "")
                    try:
                        real = expand(path)
                        with open(real, "r", encoding="utf-8", errors="replace") as f:
                            content = f.read()
                        await websocket.send(json.dumps({
                            "type":    "read_file_result",
                            "path":    path,
                            "id":      req_id,
                            "content": content,
                        }))
                    except Exception as err:
                        await websocket.send(json.dumps({
                            "type":    "error",
                            "path":    path,
                            "id":      req_id,
                            "message": f"read_file failed: {err}",
                        }))

                elif t == "write_file":
                    path    = msg.get("path", "")
                    content = msg.get("content", "")
                    try:
                        real = expand(path)
                        with open(real, "w", encoding="utf-8") as f:
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
                            "message": f"write_file failed: {err}",
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
                            "message": f"mkdir failed: {err}",
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
                            "message": f"rename failed: {err}",
                        }))

                elif t == "disconnect":
                    break

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

    async with websockets.serve(handler, args.host, args.port):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n  Stopped.")
