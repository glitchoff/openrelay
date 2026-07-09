#!/data/data/com.termux/files/usr/bin/env python3
"""OpenRelay Bridge — WebSocket server in Termux that proxies to SSH via asyncssh."""

import asyncio
import json
import os
import sys
import stat
import subprocess

WEBSOCKET_PORT = int(os.environ.get("OPENRELAY_PORT", "8080"))
SSH_TARGET = os.environ.get("OPENRELAY_SSH_TARGET", "")
SSH_PORT = int(os.environ.get("OPENRELAY_SSH_PORT", "22"))
SSHPASS = os.environ.get("SSHPASS", "")


async def handler(websocket):
    conn = None
    sftp = None
    ptys = {}
    pty_counter = 0
    reader_tasks = []

    try:
        # First message must be "connect"
        raw = await websocket.recv()
        msg = json.loads(raw)

        if msg.get("type") != "connect":
            await websocket.send(
                json.dumps({"type": "error", "message": "First message must be connect"})
            )
            return

        target = msg.get("target", SSH_TARGET)
        port = int(msg.get("port", SSH_PORT))
        password = msg.get("password") or SSHPASS

        if not target:
            await websocket.send(
                json.dumps({"type": "error", "message": "No SSH target configured"})
            )
            return

        if "@" in target:
            username, host = target.split("@", 1)
        else:
            username, host = None, target

        await websocket.send(
            json.dumps({"type": "connecting", "host": host, "port": port})
        )

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
            await websocket.send(
                json.dumps({
                    "type": "error",
                    "message": f"SSH connection failed: {str(e)}"
                })
            )
            return

        await websocket.send(
            json.dumps({"type": "connected", "host": host, "port": port})
        )

        # Start SFTP client
        sftp = await conn.start_sftp_client()

        # Start initial PTY (id=0)
        import shlex

        def make_pty_cmd(cwd=None):
            if cwd:
                return f"cd {shlex.quote(cwd)} && exec $SHELL"
            return None

        async def read_one_pty(pty_id):
            try:
                while True:
                    chan = ptys.get(pty_id)
                    if not chan:
                        break
                    data = await chan.stdout.read(4096)
                    if not data:
                        break
                    text = data.decode("utf-8", errors="replace")
                    await websocket.send(
                        json.dumps({"type": "stdout", "pty_id": pty_id, "data": text})
                    )
            except Exception:
                pass

        async def spawn_pty(cwd=None):
            nonlocal pty_counter
            cmd = make_pty_cmd(cwd)
            pty_counter += 1
            new_id = pty_counter
            chan = await conn.create_subprocess(
                cmd,
                term_type="xterm-256color",
                term_size=(80, 24),
                encoding=None
            )
            ptys[new_id] = chan
            # Send pty_created BEFORE starting reader so client wires callback first
            await websocket.send(
                json.dumps({"type": "pty_created", "pty_id": new_id})
            )
            task = asyncio.create_task(read_one_pty(new_id))
            reader_tasks.append(task)
            return new_id

        async def handle_messages():
            try:
                async for message in websocket:
                    msg = json.loads(message)
                    typ = msg.get("type")

                    if typ == "stdin":
                        pty_id = msg.get("pty_id", 0)
                        chan = ptys.get(pty_id)
                        if chan:
                            chan.stdin.write(msg["data"].encode("utf-8"))

                    elif typ == "resize":
                        pty_id = msg.get("pty_id", 0)
                        chan = ptys.get(pty_id)
                        if chan:
                            chan.change_terminal_size(msg["cols"], msg["rows"])

                    elif typ == "create_pty":
                        await spawn_pty(msg.get("cwd"))

                    elif typ == "close_pty":
                        pty_id = msg.get("pty_id")
                        if pty_id is not None:
                            chan = ptys.pop(pty_id, None)
                            if chan:
                                try:
                                    chan.close()
                                except Exception:
                                    pass

                    elif typ == "list_dir":
                        path = msg["path"]
                        try:
                            expanded_path = path
                            if path.startswith("~"):
                                home = await sftp.realpath(".")
                                expanded_path = path.replace("~", home, 1)

                            attrs = await sftp.readdir(expanded_path)
                            entries = []
                            for attr in attrs:
                                if attr.filename in (".", ".."):
                                    continue
                                permissions = attr.attrs.permissions or 0
                                is_dir = stat.S_ISDIR(permissions)
                                is_link = stat.S_ISLNK(permissions)
                                size = attr.attrs.size or 0
                                entries.append({
                                    "name": attr.filename,
                                    "is_dir": is_dir,
                                    "is_symlink": is_link,
                                    "size": size,
                                })
                            await websocket.send(
                                json.dumps({
                                    "type": "list_dir_result",
                                    "path": path,
                                    "entries": entries,
                                })
                            )
                        except Exception as err:
                            await websocket.send(
                                json.dumps({
                                    "type": "error",
                                    "path": path,
                                    "message": f"Failed to list directory: {str(err)}",
                                })
                            )

                    elif typ == "read_file":
                        path = msg["path"]
                        try:
                            expanded_path = path
                            if path.startswith("~"):
                                home = await sftp.realpath(".")
                                expanded_path = path.replace("~", home, 1)

                            async with sftp.open(
                                expanded_path, "r", encoding="utf-8", errors="replace"
                            ) as f:
                                content = await f.read()
                            await websocket.send(
                                json.dumps({
                                    "type": "read_file_result",
                                    "path": path,
                                    "content": content,
                                })
                            )
                        except Exception as err:
                            await websocket.send(
                                json.dumps({
                                    "type": "error",
                                    "path": path,
                                    "message": f"Failed to read file: {str(err)}",
                                })
                            )

                    elif typ == "write_file":
                        path = msg["path"]
                        content = msg["content"]
                        try:
                            expanded_path = path
                            if path.startswith("~"):
                                home = await sftp.realpath(".")
                                expanded_path = path.replace("~", home, 1)

                            async with sftp.open(
                                expanded_path, "w", encoding="utf-8"
                            ) as f:
                                await f.write(content)
                            await websocket.send(
                                json.dumps({
                                    "type": "write_file_result",
                                    "path": path,
                                    "success": True,
                                })
                            )
                        except Exception as err:
                            await websocket.send(
                                json.dumps({
                                    "type": "error",
                                    "path": path,
                                    "message": f"Failed to write file: {str(err)}",
                                })
                            )

                    elif typ == "mkdir":
                        path = msg["path"]
                        try:
                            expanded_path = path
                            if path.startswith("~"):
                                home = await sftp.realpath(".")
                                expanded_path = path.replace("~", home, 1)
                            await sftp.mkdir(expanded_path)
                            await websocket.send(
                                json.dumps({
                                    "type": "mkdir_result",
                                    "path": path,
                                    "success": True,
                                })
                            )
                        except Exception as err:
                            await websocket.send(
                                json.dumps({
                                    "type": "error",
                                    "path": path,
                                    "message": f"Failed to create directory: {str(err)}",
                                })
                            )

                    elif typ == "rename":
                        old_path = msg["old_path"]
                        new_path = msg["new_path"]
                        try:
                            expanded_old = old_path
                            expanded_new = new_path
                            if old_path.startswith("~"):
                                home = await sftp.realpath(".")
                                expanded_old = old_path.replace("~", home, 1)
                            if new_path.startswith("~"):
                                home = await sftp.realpath(".")
                                expanded_new = new_path.replace("~", home, 1)
                            await sftp.rename(expanded_old, expanded_new)
                            await websocket.send(
                                json.dumps({
                                    "type": "rename_result",
                                    "old_path": old_path,
                                    "new_path": new_path,
                                    "success": True,
                                })
                            )
                        except Exception as err:
                            await websocket.send(
                                json.dumps({
                                    "type": "error",
                                    "path": old_path,
                                    "message": f"Failed to rename: {str(err)}",
                                })
                            )

                    elif typ == "disconnect":
                        break
            except Exception:
                pass

        await handle_messages()

    except Exception as e:
        try:
            await websocket.send(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass
    finally:
        for pty_id, chan in list(ptys.items()):
            try:
                chan.close()
            except Exception:
                pass
        for task in reader_tasks:
            task.cancel()
        if reader_tasks:
            await asyncio.gather(*reader_tasks, return_exceptions=True)
        if sftp:
            try:
                sftp.exit()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass


async def main():
    try:
        import websockets
        import asyncssh
    except ImportError:
        print("[*] Installing requirements...", flush=True)
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "websockets", "asyncssh"]
        )
        import websockets
        import asyncssh

    print()
    print("  \033[1m\033[38;5;208m🔥 OpenRelay Bridge (SFTP Multiplexed)\033[0m")
    print("  \033[2m──────────────────────────────────────────\033[0m")
    print(f"  WebSocket: ws://127.0.0.1:{WEBSOCKET_PORT}")

    if SSH_TARGET:
        key_type = "password" if SSHPASS else "key"
        print(f"  SSH:       {SSH_TARGET} ({key_type})")
    else:
        print("  SSH:       <send target via PWA>")

    print()

    async with websockets.serve(handler, "127.0.0.1", WEBSOCKET_PORT):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
