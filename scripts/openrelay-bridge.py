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
    chan = None
    sftp = None
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

        # Start PTY shell
        chan = await conn.create_subprocess(
            term_type="xterm-256color",
            term_size=(80, 24),
            encoding=None
        )

        async def read_pty():
            while True:
                try:
                    data = await chan.stdout.read(4096)
                    if not data:
                        break
                    text = data.decode("utf-8", errors="replace")
                    await websocket.send(
                        json.dumps({"type": "stdout", "data": text})
                    )
                except Exception:
                    break

        async def write_pty():
            try:
                async for message in websocket:
                    msg = json.loads(message)
                    typ = msg.get("type")
                    if typ == "stdin":
                        chan.stdin.write(msg["data"].encode("utf-8"))
                    elif typ == "resize":
                        chan.change_terminal_size(msg["cols"], msg["rows"])
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
                    elif typ == "disconnect":
                        break
            except Exception:
                pass

        await asyncio.gather(read_pty(), write_pty())

    except Exception as e:
        try:
            await websocket.send(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass
    finally:
        if chan:
            try:
                chan.close()
            except Exception:
                pass
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
