#!/data/data/com.termux/files/usr/bin/bash

#
# OpenRelay Setup — AsyncSSH Edition
#
# Usage:
#   bash setup.sh
#
# Or:
#   bash <(curl -sL https://raw.githubusercontent.com/glitchoff/openrelay/refs/heads/master/scripts/setup.sh)
#
# Behavior:
#   - Uses AsyncSSH instead of native ssh subprocesses.
#   - Uses a real SSH PTY.
#   - Supports terminal resize.
#   - Uses SFTP for file operations.
#   - Never stores SSH passwords.
#   - Runs directly in the Termux foreground.
#   - Shows live logs.
#   - Ctrl+C shuts everything down.
#

set -Eeuo pipefail

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
RED='\033[0;31m'
NC='\033[0m'

VERSION="3.1.0"

BRIDGE_DIR="$HOME/.openrelay"
CONFIG_FILE="$BRIDGE_DIR/config.sh"
BRIDGE_FILE="$BRIDGE_DIR/bridge.py"

echo -e "${YELLOW}"
echo "   ____                   ____      __             "
echo "  / __ \____  ___  ____  / __ \___ / /___ ___  __ "
echo " / / / / __ \/ _ \/ __ \/ /_/ / _ \/ / __ \`/ / / /"
echo "/ /_/ / /_/ /  __/ / / / _, _/  __/ / /_/ /_/ / / "
echo "\____/ .___/\___/_/ /_/_/ |_|\___/_/_/\__,_/\__, /  "
echo "    /_/                                    /____/    "
echo -e "${NC}"

echo -e "${BOLD}  🔥 OpenRelay Bridge Setup v${VERSION}${NC}"
echo -e "${DIM}  ──────────────────────────────────────────${NC}"
echo ""

# Always accept input from the actual Termux terminal,
# even when setup.sh is piped through curl.
exec < /dev/tty

mkdir -p "$BRIDGE_DIR"


# ================================================================
# Previous configuration
# ================================================================

PREV_TARGET=""
PREV_PORT="22"

if [ -f "$CONFIG_FILE" ]; then

    # shellcheck disable=SC1090
    source "$CONFIG_FILE"

    PREV_TARGET="${OPENRELAY_SSH_TARGET:-}"
    PREV_PORT="${OPENRELAY_SSH_PORT:-22}"
fi


TARGET=""
PORT=""


if [ -n "$PREV_TARGET" ]; then

    echo -e "${YELLOW}Found previous configuration:${NC}"

    echo -e "  SSH Target: ${BLUE}${PREV_TARGET}${NC}"
    echo -e "  SSH Port:   ${BLUE}${PREV_PORT}${NC}"

    echo ""

    read -r -p "$(echo -e "${BLUE}?${NC} Use this configuration? (Y/n): ")" USE_PREV

    USE_PREV="${USE_PREV:-y}"

    if [[ "$USE_PREV" =~ ^[Yy]$ ]]; then
        TARGET="$PREV_TARGET"
        PORT="$PREV_PORT"
    fi

    echo ""
fi


# ================================================================
# Ask for SSH target
# ================================================================

if [ -z "$TARGET" ]; then

    while [ -z "$TARGET" ]; do

        read -r -p "$(echo -e "${BLUE}?${NC} SSH target ${DIM}(user@host)${NC}: ")" TARGET

    done

    read -r -p "$(echo -e "${BLUE}?${NC} SSH port ${DIM}[22]${NC}: ")" PORT

    PORT="${PORT:-22}"
fi


# ================================================================
# Validate SSH target
# ================================================================

if [[ "$TARGET" != *@* ]]; then

    echo -e "${RED}SSH target must use user@host format.${NC}"

    exit 1
fi


SSH_USERNAME="${TARGET%@*}"
SSH_HOST="${TARGET#*@}"


if [ -z "$SSH_USERNAME" ] || [ -z "$SSH_HOST" ]; then

    echo -e "${RED}Invalid SSH target: ${TARGET}${NC}"

    exit 1
fi


# ================================================================
# Validate port
# ================================================================

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then

    echo -e "${RED}Invalid SSH port: ${PORT}${NC}"

    exit 1
fi


# ================================================================
# Ask for password
# ================================================================

echo ""

read -r -s -p "$(echo -e "${BLUE}?${NC} SSH password ${DIM}(blank for key authentication)${NC}: ")" PASSWORD

echo ""
echo ""


# ================================================================
# Install dependencies
# ================================================================

echo -e "${YELLOW}▶ Installing Termux dependencies...${NC}"
echo ""

pkg update -y -q

pkg install -y \
    python \
    openssh


echo ""
echo -e "${YELLOW}▶ Installing Python dependencies...${NC}"
echo ""

python -m pip install --upgrade \
    websockets \
    asyncssh


# ================================================================
# Save safe configuration
#
# Password is NEVER written to disk.
# ================================================================

cat > "$CONFIG_FILE" <<EOF
export OPENRELAY_PORT="8080"
export OPENRELAY_SSH_TARGET=$(printf '%q' "$TARGET")
export OPENRELAY_SSH_PORT=$(printf '%q' "$PORT")
EOF

chmod 600 "$CONFIG_FILE"


# ================================================================
# Write bridge.py
# ================================================================

cat > "$BRIDGE_FILE" <<'PYEOF'
#!/data/data/com.termux/files/usr/bin/env python3

import asyncio
import base64
import contextlib
import json
import os
import secrets
import signal
import sys

import asyncssh
import websockets


# ================================================================
# Configuration
# ================================================================

WEBSOCKET_HOST = "127.0.0.1"

WEBSOCKET_PORT = int(
    os.environ.get(
        "OPENRELAY_PORT",
        "8080",
    )
)

SSH_TARGET = os.environ.get(
    "OPENRELAY_SSH_TARGET",
    "",
)

SSH_PORT = int(
    os.environ.get(
        "OPENRELAY_SSH_PORT",
        "22",
    )
)

SSH_PASSWORD = os.environ.get(
    "OPENRELAY_SSH_PASSWORD",
    "",
)


if "@" not in SSH_TARGET:

    print(
        "\033[31m"
        "[OpenRelay] Invalid SSH target. "
        "Expected user@host."
        "\033[0m",
        flush=True,
    )

    raise SystemExit(1)


SSH_USERNAME, SSH_HOST = SSH_TARGET.split("@", 1)


# ================================================================
# Logging
# ================================================================

def log(message):

    print(
        f"\033[2m[OpenRelay]\033[0m {message}",
        flush=True,
    )


def log_success(message):

    print(
        f"\033[32m[OpenRelay]\033[0m {message}",
        flush=True,
    )


def log_error(message):

    print(
        f"\033[31m[OpenRelay]\033[0m {message}",
        flush=True,
    )


# ================================================================
# Active connections
# ================================================================

ACTIVE_CONNECTIONS = set()


# ================================================================
# OpenRelay SSH connection
# ================================================================

class OpenRelayConnection:

    def __init__(self, websocket):

        self.websocket = websocket

        self.connection_id = secrets.token_hex(4)

        self.ssh = None

        self.shells = {}

        self.shell_counter = 0

        self.sftp = None

        self.closed = False

        self.reader_tasks = []

        self.send_lock = asyncio.Lock()


    # ============================================================
    # WebSocket send
    # ============================================================

    async def send(self, payload):

        async with self.send_lock:

            await self.websocket.send(
                json.dumps(payload)
            )


    # ============================================================
    # Connect SSH
    # ============================================================

    async def connect(self):

        log(
            f"{self.connection_id}: "
            f"connecting to "
            f"{SSH_USERNAME}@{SSH_HOST}:{SSH_PORT}"
        )


        await self.send({

            "type": "connecting",

            "host": SSH_TARGET,

            "port": SSH_PORT,

        })


        connect_options = {

            "host": SSH_HOST,

            "port": SSH_PORT,

            "username": SSH_USERNAME,

            "known_hosts": None,

            "connect_timeout": 15,

            "keepalive_interval": 30,

            "keepalive_count_max": 3,

        }


        if SSH_PASSWORD:

            connect_options["password"] = SSH_PASSWORD


        self.ssh = await asyncssh.connect(
            **connect_options
        )


        log_success(
            f"{self.connection_id}: SSH connected"
        )


        await self.send({

            "type": "connected",

            "host": SSH_TARGET,

            "port": SSH_PORT,

        })


    # ============================================================
    # Start SFTP
    # ============================================================

    async def start_sftp(self):

        self.sftp = await self.ssh.start_sftp_client()


        log(
            f"{self.connection_id}: "
            "SFTP started"
        )


    # ============================================================
    # Start interactive PTY shell
    # ============================================================

    async def start_shell(
        self,
        cols=80,
        rows=24,
        cwd=None,
    ):

        self.shell_counter += 1
        shell_id = self.shell_counter

        if cwd:
            import shlex
            cmd = f"cd {shlex.quote(cwd)} && exec $SHELL"
        else:
            cmd = None

        shell = await self.ssh.create_process(
            cmd,
            term_type="xterm-256color",
            term_size=(cols, rows),
            encoding=None,
        )

        self.shells[shell_id] = shell

        log(
            f"{self.connection_id}: "
            f"PTY shell #{shell_id} started "
            f"({cols}x{rows})"
        )

        return shell_id


    # ============================================================
    # Read PTY output for a specific shell
    # ============================================================

    async def read_shell(self, shell_id):

        shell = self.shells.get(shell_id)

        if not shell:
            return

        try:

            while True:

                data = await shell.stdout.read(
                    8192
                )


                if not data:
                    break


                text = data.decode(
                    "utf-8",
                    errors="replace",
                )


                await self.send({

                    "type": "stdout",

                    "pty_id": shell_id,

                    "data": text,

                })


        except asyncio.CancelledError:

            raise


        except Exception as error:

            log_error(
                f"{self.connection_id}: "
                f"PTY #{shell_id} reader failed: {error}"
            )


    # ============================================================
    # Write PTY input
    # ============================================================

    async def write_stdin(self, shell_id, data):

        shell = self.shells.get(shell_id)

        if not shell:
            return


        if not isinstance(data, str):
            return


        shell.stdin.write(
            data.encode(
                "utf-8",
                errors="replace",
            )
        )


        await shell.stdin.drain()


    # ============================================================
    # Resize PTY
    # ============================================================

    def resize(self, shell_id, cols, rows):

        shell = self.shells.get(shell_id)

        if not shell:
            return


        try:

            cols = int(cols)
            rows = int(rows)


            if cols < 1 or rows < 1:
                return


            if cols > 1000 or rows > 1000:
                return


            shell.change_terminal_size(
                cols,
                rows,
            )


            log(
                f"{self.connection_id}: "
                f"PTY #{shell_id} resized to {cols}x{rows}"
            )


        except (TypeError, ValueError):

            pass


    # ============================================================
    # Close a specific PTY
    # ============================================================

    async def close_shell(self, shell_id):

        shell = self.shells.pop(
            shell_id,
            None,
        )

        if not shell:
            return

        with contextlib.suppress(Exception):

            shell.stdin.write_eof()

        with contextlib.suppress(Exception):

            shell.close()

        with contextlib.suppress(Exception):

            await asyncio.wait_for(
                shell.wait_closed(),
                timeout=3,
            )

        log(
            f"{self.connection_id}: "
            f"PTY #{shell_id} closed"
        )


    # ============================================================
    # Resolve SFTP path
    # ============================================================

    async def resolve_path(self, path):

        if not isinstance(path, str):

            raise ValueError(
                "Invalid path"
            )


        if path == "~":

            return await self.sftp.realpath(".")


        # Bare drive letter ("D:") -> root ("D:/")
        if len(path) == 2 and path[1] == ':':
            path += '/'

        if path.startswith("~/"):

            home = await self.sftp.realpath(".")

            return (
                home.rstrip("/")
                + "/"
                + path[2:]
            )


        return path


    # ============================================================
    # List directory
    # ============================================================

    async def list_directory(
        self,
        path,
    ):

        path = await self.resolve_path(path)

        names = await self.sftp.listdir(path)

        entries = []


        for name in names:

            try:

                full_path = (
                    path.rstrip("/")
                    + "/"
                    + name
                )


                attrs = await self.sftp.lstat(
                    full_path
                )


                permissions = attrs.permissions or 0


                is_dir = (
                    permissions & 0o170000
                ) == 0o040000


                is_symlink = (
                    permissions & 0o170000
                ) == 0o120000


                entries.append({

                    "name": name,

                    "is_dir": is_dir,

                    "is_symlink": is_symlink,

                    "size": attrs.size or 0,

                })


            except Exception as error:

                log_error(
                    f"{self.connection_id}: "
                    f"unable to stat {name}: {error}"
                )


        return entries


    # ============================================================
    # Read file
    # ============================================================

    async def read_file(
        self,
        path,
    ):

        path = await self.resolve_path(path)


        async with self.sftp.open(
            path,
            "rb",
        ) as file:

            return await file.read()


    # ============================================================
    # Write file
    # ============================================================

    async def write_file(
        self,
        path,
        content,
    ):

        path = await self.resolve_path(path)


        async with self.sftp.open(
            path,
            "wb",
        ) as file:

            await file.write(content)


    # ============================================================
    # Create directory
    # ============================================================

    async def create_directory(
        self,
        path,
    ):

        path = await self.resolve_path(path)

        await self.sftp.mkdir(path)


    # ============================================================
    # Rename
    # ============================================================

    async def rename_path(
        self,
        old_path,
        new_path,
    ):

        old_path = await self.resolve_path(old_path)
        new_path = await self.resolve_path(new_path)

        await self.sftp.rename(
            old_path,
            new_path,
        )


    # ============================================================
    # Close connection
    # ============================================================

    async def close(self):

        if self.closed:
            return


        self.closed = True


        log(
            f"{self.connection_id}: "
            "closing connection"
        )


        # --------------------------------------------------------
        # Cancel reader tasks
        # --------------------------------------------------------

        for task in self.reader_tasks:

            task.cancel()

        if self.reader_tasks:

            await asyncio.gather(
                *self.reader_tasks,
                return_exceptions=True,
            )


        # --------------------------------------------------------
        # Close all shells
        # --------------------------------------------------------

        for shell_id in list(self.shells.keys()):

            await self.close_shell(shell_id)


        # --------------------------------------------------------
        # Close SFTP
        # --------------------------------------------------------

        if self.sftp:

            with contextlib.suppress(Exception):

                self.sftp.exit()


            with contextlib.suppress(Exception):

                await asyncio.wait_for(
                    self.sftp.wait_closed(),
                    timeout=3,
                )


            self.sftp = None


        # --------------------------------------------------------
        # Close SSH
        # --------------------------------------------------------

        if self.ssh:

            self.ssh.close()


            with contextlib.suppress(Exception):

                await asyncio.wait_for(
                    self.ssh.wait_closed(),
                    timeout=5,
                )


            self.ssh = None


        log(
            f"{self.connection_id}: "
            "connection closed"
        )


# ================================================================
# Handle list directory
# ================================================================

async def handle_list_directory(
    connection,
    message,
):

    request_id = message.get(
        "id",
        "",
    )

    path = message.get(
        "path"
    )


    try:

        entries = await connection.list_directory(
            path
        )


        await connection.send({

            "type": "list_dir_result",

            "path": path,

            "id": request_id,

            "entries": entries,

        })


    except Exception as error:

        await connection.send({

            "type": "error",

            "path": path,

            "id": request_id,

            "message": (
                f"Failed to list directory: "
                f"{error}"
            ),

        })


# ================================================================
# Handle read file
# ================================================================

async def handle_read_file(
    connection,
    message,
):

    request_id = message.get(
        "id",
        "",
    )

    path = message.get(
        "path"
    )


    try:

        content = await connection.read_file(
            path
        )


        content_b64 = base64.b64encode(
            content
        ).decode("ascii")


        await connection.send({

            "type": "read_file_result",

            "path": path,

            "id": request_id,

            "content_b64": content_b64,

        })


    except Exception as error:

        await connection.send({

            "type": "error",

            "path": path,

            "id": request_id,

            "message": (
                f"Failed to read file: "
                f"{error}"
            ),

        })


# ================================================================
# Handle write file
# ================================================================

async def handle_write_file(
    connection,
    message,
):

    request_id = message.get(
        "id",
        "",
    )

    path = message.get(
        "path"
    )


    try:

        # New binary-safe protocol.

        if isinstance(
            message.get("content_b64"),
            str,
        ):

            content = base64.b64decode(
                message["content_b64"],
                validate=True,
            )


        # Compatibility with current frontend.

        elif isinstance(
            message.get("content"),
            str,
        ):

            content = message[
                "content"
            ].encode("utf-8")


        else:

            raise ValueError(
                "Missing file content"
            )


        await connection.write_file(
            path,
            content,
        )


        await connection.send({

            "type": "write_file_result",

            "path": path,

            "id": request_id,

            "success": True,

        })


    except Exception as error:

        await connection.send({

            "type": "error",

            "path": path,

            "id": request_id,

            "message": (
                f"Failed to write file: "
                f"{error}"
            ),

        })


# ================================================================
# Handle mkdir
# ================================================================

async def handle_mkdir(
    connection,
    message,
):

    request_id = message.get(
        "id",
        "",
    )

    path = message.get(
        "path"
    )


    try:

        await connection.create_directory(
            path
        )


        await connection.send({

            "type": "mkdir_result",

            "path": path,

            "id": request_id,

            "success": True,

        })


    except Exception as error:

        await connection.send({

            "type": "error",

            "path": path,

            "id": request_id,

            "message": (
                f"Failed to create directory: "
                f"{error}"
            ),

        })


# ================================================================
# Handle rename
# ================================================================

async def handle_rename(
    connection,
    message,
):

    request_id = message.get(
        "id",
        "",
    )

    old_path = message.get(
        "old_path"
    )

    new_path = message.get(
        "new_path"
    )


    try:

        await connection.rename_path(
            old_path,
            new_path,
        )


        await connection.send({

            "type": "rename_result",

            "old_path": old_path,

            "new_path": new_path,

            "id": request_id,

            "success": True,

        })


    except Exception as error:

        await connection.send({

            "type": "error",

            "path": old_path,

            "id": request_id,

            "message": (
                f"Failed to rename: "
                f"{error}"
            ),

        })


# ================================================================
# WebSocket reader
# ================================================================

async def websocket_reader(
    connection,
):

    async for raw_message in connection.websocket:

        try:

            message = json.loads(
                raw_message
            )


        except json.JSONDecodeError:

            await connection.send({

                "type": "error",

                "message": "Invalid JSON message",

            })

            continue


        message_type = message.get(
            "type"
        )


        # --------------------------------------------------------
        # STDIN
        # --------------------------------------------------------

        if message_type == "stdin":

            await connection.write_stdin(

                message.get(
                    "pty_id",
                    0,
                ),

                message.get(
                    "data",
                    "",
                ),

            )


        # --------------------------------------------------------
        # Resize
        # --------------------------------------------------------

        elif message_type == "resize":

            connection.resize(

                message.get(
                    "pty_id",
                    0,
                ),

                message.get(
                    "cols",
                    80,
                ),

                message.get(
                    "rows",
                    24,
                ),

            )


        # --------------------------------------------------------
        # Create PTY
        # --------------------------------------------------------

        elif message_type == "create_pty":

            try:

                pty_id = await connection.start_shell(

                    cols=80,
                    rows=24,
                    cwd=message.get(
                        "cwd"
                    ),

                )


                await connection.send({

                    "type": "pty_created",

                    "pty_id": pty_id,

                })


                # Start reader AFTER pty_created so client
                # wires callback before any stdout arrives

                task = asyncio.create_task(

                    connection.read_shell(
                        pty_id
                    )

                )

                connection.reader_tasks.append(
                    task
                )

            except Exception as error:

                await connection.send({

                    "type": "error",

                    "message": (
                        f"Failed to create PTY: "
                        f"{error}"
                    ),

                })


        # --------------------------------------------------------
        # Close PTY
        # --------------------------------------------------------

        elif message_type == "close_pty":

            await connection.close_shell(

                message.get(
                    "pty_id"
                ),

            )


        # --------------------------------------------------------
        # List directory
        # --------------------------------------------------------

        elif message_type == "list_dir":

            await handle_list_directory(
                connection,
                message,
            )


        # --------------------------------------------------------
        # Read file
        # --------------------------------------------------------

        elif message_type == "read_file":

            await handle_read_file(
                connection,
                message,
            )


        # --------------------------------------------------------
        # Write file
        # --------------------------------------------------------

        elif message_type == "write_file":

            await handle_write_file(
                connection,
                message,
            )


        # --------------------------------------------------------
        # Mkdir
        # --------------------------------------------------------

        elif message_type == "mkdir":

            await handle_mkdir(
                connection,
                message,
            )


        # --------------------------------------------------------
        # Rename
        # --------------------------------------------------------

        elif message_type == "rename":

            await handle_rename(
                connection,
                message,
            )


        # --------------------------------------------------------
        # Disconnect
        # --------------------------------------------------------

        elif message_type == "disconnect":

            break


        # --------------------------------------------------------
        # Unknown
        # --------------------------------------------------------

        else:

            await connection.send({

                "type": "error",

                "id": message.get(
                    "id",
                    "",
                ),

                "message": (
                    f"Unknown message type: "
                    f"{message_type}"
                ),

            })


# ================================================================
# WebSocket handler
# ================================================================

async def handler(websocket):

    connection = None


    try:

        # --------------------------------------------------------
        # Wait for connect message
        # --------------------------------------------------------

        raw_message = await asyncio.wait_for(

            websocket.recv(),

            timeout=30,

        )


        try:

            message = json.loads(
                raw_message
            )


        except json.JSONDecodeError:

            await websocket.send(

                json.dumps({

                    "type": "error",

                    "message": "Invalid JSON message",

                })

            )

            return


        if message.get("type") != "connect":

            await websocket.send(

                json.dumps({

                    "type": "error",

                    "message": (
                        "First message must be connect"
                    ),

                })

            )

            return


        # --------------------------------------------------------
        # Create connection
        # --------------------------------------------------------

        connection = OpenRelayConnection(
            websocket
        )


        ACTIVE_CONNECTIONS.add(
            connection
        )


        # --------------------------------------------------------
        # Connect SSH
        # --------------------------------------------------------

        await connection.connect()


        # --------------------------------------------------------
        # Start SFTP
        # ========================================================

        await connection.start_sftp()


        # --------------------------------------------------------
        # Get initial terminal size
        # --------------------------------------------------------

        cols = message.get(
            "cols",
            80,
        )

        rows = message.get(
            "rows",
            24,
        )


        try:

            cols = int(cols)
            rows = int(rows)


        except (TypeError, ValueError):

            cols = 80
            rows = 24


        cols = max(
            1,
            min(cols, 1000),
        )

        rows = max(
            1,
            min(rows, 1000),
        )


        # --------------------------------------------------------
        # Run WebSocket reader (creates PTYs on demand)
        # --------------------------------------------------------

        websocket_task = asyncio.create_task(

            websocket_reader(
                connection
            )

        )

        reader_tasks.append(
            websocket_task
        )


        done, pending = await asyncio.wait(

            {
                shell_task,
                websocket_task,
            },

            return_when=asyncio.FIRST_COMPLETED,

        )


        for task in pending:

            task.cancel()


        await asyncio.gather(

            *pending,

            return_exceptions=True,

        )


        for task in done:

            if task.cancelled():
                continue


            exception = task.exception()


            if exception:
                raise exception


    except asyncio.TimeoutError:

        log_error(
            "WebSocket connection timed out"
        )


    except asyncssh.PermissionDenied:

        log_error(
            "SSH authentication failed"
        )


        if connection:

            with contextlib.suppress(Exception):

                await connection.send({

                    "type": "error",

                    "message": (
                        "SSH authentication failed"
                    ),

                })


    except asyncssh.HostKeyNotVerifiable as error:

        log_error(
            f"SSH host key error: {error}"
        )


        if connection:

            with contextlib.suppress(Exception):

                await connection.send({

                    "type": "error",

                    "message": (
                        f"SSH host key error: "
                        f"{error}"
                    ),

                })


    except Exception as error:

        log_error(
            str(error)
        )


        if connection:

            with contextlib.suppress(Exception):

                await connection.send({

                    "type": "error",

                    "message": str(error),

                })


    finally:

        if connection:

            ACTIVE_CONNECTIONS.discard(
                connection
            )


            await connection.close()


# ================================================================
# Main
# ================================================================

async def main():

    stop_event = asyncio.Event()

    loop = asyncio.get_running_loop()


    def request_shutdown():

        if not stop_event.is_set():

            print()

            log(
                "shutdown requested..."
            )

            stop_event.set()


    for signal_name in (

        signal.SIGINT,

        signal.SIGTERM,

    ):

        with contextlib.suppress(
            NotImplementedError
        ):

            loop.add_signal_handler(

                signal_name,

                request_shutdown,

            )


    print()

    print(
        "  \033[1m"
        "\033[38;5;208m"
        "🔥 OpenRelay Bridge — AsyncSSH"
        "\033[0m"
    )

    print(
        "  \033[2m"
        "──────────────────────────────────────────"
        "\033[0m"
    )

    print(
        f"  WebSocket: "
        f"ws://{WEBSOCKET_HOST}:{WEBSOCKET_PORT}"
    )

    print(
        f"  SSH:       "
        f"{SSH_USERNAME}@{SSH_HOST}:{SSH_PORT}"
    )

    print(
        f"  Auth:      "
        f"{'password' if SSH_PASSWORD else 'SSH key'}"
    )

    print(
        "  Files:     SFTP"
    )

    print(
        "  Terminal:  SSH PTY"
    )

    print()

    print(
        "  \033[2m"
        "Press Ctrl+C to stop OpenRelay"
        "\033[0m"
    )

    print()


    async with websockets.serve(

        handler,

        WEBSOCKET_HOST,

        WEBSOCKET_PORT,

        ping_interval=20,

        ping_timeout=20,

        max_size=32 * 1024 * 1024,

    ):

        log_success(
            "WebSocket server started"
        )


        await stop_event.wait()


    # ============================================================
    # Close active connections
    # ============================================================

    if ACTIVE_CONNECTIONS:

        log(
            f"closing "
            f"{len(ACTIVE_CONNECTIONS)} "
            f"active connection(s)..."
        )


        await asyncio.gather(

            *[

                connection.close()

                for connection

                in list(
                    ACTIVE_CONNECTIONS
                )

            ],

            return_exceptions=True,

        )


    ACTIVE_CONNECTIONS.clear()


    log_success(
        "OpenRelay stopped"
    )


    return 0


if __name__ == "__main__":

    try:

        exit_code = asyncio.run(
            main()
        )


        raise SystemExit(
            exit_code or 0
        )


    except KeyboardInterrupt:

        print()

        log_success(
            "OpenRelay stopped"
        )
PYEOF


chmod +x "$BRIDGE_FILE"


# ================================================================
# Start bridge in foreground
# ================================================================

echo ""
echo -e "${GREEN}  ✅ OpenRelay configured${NC}"
echo ""
echo -e "  SSH: ${BLUE}${TARGET}:${PORT}${NC}"
echo ""
echo -e "${BOLD}  Starting AsyncSSH bridge...${NC}"
echo -e "${DIM}  Press Ctrl+C to stop OpenRelay.${NC}"
echo ""

cd "$BRIDGE_DIR"


# ================================================================
# Free WebSocket port (bridge.py only — don't kill random apps)
# ================================================================

if command -v lsof >/dev/null 2>&1; then

    OLD_PID="$(lsof -t -i :8080 2>/dev/null || true)"

    if [ -n "$OLD_PID" ]; then

        # Verify it's actually an OpenRelay bridge, not some other app.
        if ps -p "$OLD_PID" -o command= 2>/dev/null | grep -q "bridge.py"; then

            echo -e "${YELLOW}  ⚠ Port 8080 is in use by an old bridge.${NC}"
            echo -e "${DIM}  Stopping PID ${OLD_PID}...${NC}"

            kill "$OLD_PID" 2>/dev/null || true
            sleep 1

            if kill -0 "$OLD_PID" 2>/dev/null; then
                kill -9 "$OLD_PID" 2>/dev/null || true
            fi

        else

            echo -e "${RED}  ❌ Port 8080 is in use by another process.${NC}"
            echo -e "${DIM}  PID: ${OLD_PID} ($(ps -p "$OLD_PID" -o comm= 2>/dev/null || echo '?'))${NC}"
            echo ""
            echo -e "${RED}  Free the port and try again.${NC}"

            exit 1

        fi

    fi

fi


# Password exists only in this process environment.
#
# It is never written to config.sh or another file.
#
# exec replaces this Bash process with Python.

exec env \
    OPENRELAY_PORT="8080" \
    OPENRELAY_SSH_TARGET="$TARGET" \
    OPENRELAY_SSH_PORT="$PORT" \
    OPENRELAY_SSH_PASSWORD="$PASSWORD" \
    python "$BRIDGE_FILE"