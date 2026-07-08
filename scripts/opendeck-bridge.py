#!/data/data/com.termux/files/usr/bin/env python3
"""OpenDeck Bridge — WebSocket server in Termux that proxies to SSH."""

import asyncio
import json
import os
import pty
import struct
import fcntl
import termios
import signal
import sys
import subprocess

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
        ssh_cmd = [
            "sshpass", "-e",
            "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "LogLevel=ERROR",
            "-p", str(port),
            target,
            cmd
        ]
    else:
        ssh_cmd = [
            "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "LogLevel=ERROR",
            "-p", str(port),
            target,
            cmd
        ]
    
    proc = await asyncio.create_subprocess_exec(
        *ssh_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    return stdout.decode('utf-8', errors='replace'), stderr.decode('utf-8', errors='replace')


async def proxy_ssh(websocket, target, port):
    use_sshpass = bool(os.environ.get("SSHPASS"))

    if use_sshpass:
        ssh_cmd = [
            "sshpass", "-e",
            "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "LogLevel=ERROR",
            "-o", "ServerAliveInterval=30",
            "-p", str(port),
            "-t", "-t",
            target,
        ]
    else:
        ssh_cmd = [
            "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "LogLevel=ERROR",
            "-o", "ServerAliveInterval=30",
            "-p", str(port),
            "-t", "-t",
            target,
        ]

    master_fd, slave_fd = pty.openpty()

    proc = await asyncio.create_subprocess_exec(
        *ssh_cmd,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        preexec_fn=os.setsid,
    )

    os.close(slave_fd)
    set_winsize(master_fd, 24, 80)
    loop = asyncio.get_event_loop()

    async def read_pty():
        while True:
            try:
                data = await loop.run_in_executor(None, os.read, master_fd, 4096)
            except OSError:
                break
            if not data:
                break
            text = data.decode("utf-8", errors="replace")
            try:
                await websocket.send(json.dumps({"type": "stdout", "data": text}))
            except Exception:
                break

    async def write_pty():
        try:
            async for message in websocket:
                msg = json.loads(message)
                typ = msg.get("type")
                if typ == "stdin":
                    chunk = msg["data"].encode("utf-8")
                    os.write(master_fd, chunk)
                elif typ == "resize":
                    set_winsize(master_fd, msg["rows"], msg["cols"])
                elif typ == "list_dir":
                    path = msg["path"]
                    # Remote script to list files in path and return structured JSON
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
                            await websocket.send(json.dumps({
                                "type": "list_dir_result",
                                "path": path,
                                "entries": data["entries"]
                            }))
                            continue
                    except:
                        pass
                        
                    # Fallback to python
                    stdout, _ = await run_ssh_command(target, port, f"python -c {repr(python_cmd)}")
                    try:
                        data = json.loads(stdout.strip())
                        if data.get("status") == "success":
                            await websocket.send(json.dumps({
                                "type": "list_dir_result",
                                "path": path,
                                "entries": data["entries"]
                            }))
                            continue
                    except:
                        pass
                        
                    await websocket.send(json.dumps({
                        "type": "error",
                        "path": path,
                        "message": f"Failed to list directory: {stdout or stderr or 'Python not found or folder does not exist'}"
                    }))
                    
                elif typ == "read_file":
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
                        await websocket.send(json.dumps({
                            "type": "error",
                            "path": path,
                            "message": output[6:]
                        }))
                        continue
                        
                    if output:
                        try:
                            import base64
                            content = base64.b64decode(output).decode('utf-8', errors='replace')
                            await websocket.send(json.dumps({
                                "type": "read_file_result",
                                "path": path,
                                "content": content
                            }))
                            continue
                        except:
                            pass
                            
                    # Fallback to python
                    stdout, _ = await run_ssh_command(target, port, f"python -c {repr(python_cmd)}")
                    output = stdout.strip()
                    if output.startswith("ERROR:"):
                        await websocket.send(json.dumps({
                            "type": "error",
                            "path": path,
                            "message": output[6:]
                        }))
                    else:
                        try:
                            import base64
                            content = base64.b64decode(output).decode('utf-8', errors='replace')
                            await websocket.send(json.dumps({
                                "type": "read_file_result",
                                "path": path,
                                "content": content
                            }))
                        except Exception as err:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "path": path,
                                "message": f"Failed to read file: {stdout or stderr or str(err)}"
                            }))
                            
                elif typ == "write_file":
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
                        await websocket.send(json.dumps({
                            "type": "write_file_result",
                            "path": path,
                            "success": True
                        }))
                        continue
                        
                    # Fallback to python
                    stdout, _ = await run_ssh_command(target, port, f"python -c {repr(python_cmd)}")
                    output = stdout.strip()
                    if output == "SUCCESS":
                        await websocket.send(json.dumps({
                            "type": "write_file_result",
                            "path": path,
                            "success": True
                        }))
                    else:
                        await websocket.send(json.dumps({
                            "type": "error",
                            "path": path,
                            "message": f"Failed to write file: {stdout or stderr or output}"
                        }))
                        
                elif typ == "disconnect":
                    break
        except Exception:
            pass

    try:
        await asyncio.gather(read_pty(), write_pty())
    finally:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGHUP)
        except (ProcessLookupError, PermissionError):
            pass
        try:
            os.close(master_fd)
        except OSError:
            pass
        try:
            await proc.wait()
        except Exception:
            pass


async def handler(websocket):
    try:
        raw = await websocket.recv()
        msg = json.loads(raw)

        if msg.get("type") != "connect":
            await websocket.send(
                json.dumps({"type": "error", "message": "First message must be connect"})
            )
            return

        # Use values from connect message, fall back to env vars
        target = msg.get("target", SSH_TARGET)
        port = int(msg.get("port", SSH_PORT))

        if msg.get("password"):
            os.environ["SSHPASS"] = msg["password"]

        if not target:
            await websocket.send(
                json.dumps({"type": "error", "message": "No SSH target configured"})
            )
            return

        await websocket.send(
            json.dumps({"type": "connected", "host": target, "port": port})
        )
        await proxy_ssh(websocket, target, port)

    except Exception as e:
        try:
            await websocket.send(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass


async def main():
    try:
        import websockets
    except ImportError:
        print("[*] Installing websockets...", flush=True)
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "websockets"]
        )
        import websockets

    print()
    print("  \033[1m\033[38;5;208m🔥 OpenDeck Bridge\033[0m")
    print("  \033[2m─────────────────────\033[0m")
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
