#!/usr/bin/env python3
"""WebUI セッション用 PTY リレー (Python 標準ライブラリのみ)

Node.js サーバーから起動され、argv[1] の JSON スペックに従って
子プロセスを疑似端末 (PTY) 上で実行する。

入出力の取り決め:
  - 制御: stdin への JSON Lines
      {"type":"input","data":"<base64>"}
      {"type":"resize","cols":120,"rows":40}
      {"type":"kill"}
  - PTY 出力: stdout への raw バイト列
  - 状態: stderr への JSON Lines
      {"type":"error","message":"..."}
      {"type":"exit","code":0}

スペック例:
  {"command":["/bin/bash","/path/launch.sh","--project-dir","/path"],
   "cwd":"/path","env":{"TERM":"xterm-256color"},"cols":80,"rows":24}
"""

import base64
import errno
import fcntl
import json
import os
import pty
import selectors
import signal
import struct
import sys
import termios
import time

MAX_IO = 65536


def write_bytes(stream, data):
    try:
        stream.write(data)
        stream.flush()
    except (BrokenPipeError, OSError):
        pass


def set_winsize(fd, cols, rows):
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    except OSError:
        pass


def emit_status(message):
    write_bytes(
        sys.stderr.buffer,
        (json.dumps(message, ensure_ascii=False) + "\n").encode("utf-8"),
    )


def main():
    try:
        spec = json.loads(sys.argv[1])
    except Exception as exc:  # noqa: BLE001
        emit_status({"type": "error", "message": f"invalid spec: {exc}"})
        return 2

    command = spec.get("command")
    if not isinstance(command, list) or not command or not all(
        isinstance(x, str) for x in command
    ):
        emit_status({"type": "error", "message": "command must be a non-empty string array"})
        return 2

    cwd = spec.get("cwd") or None
    env = dict(os.environ)
    env.update({str(k): str(v) for k, v in (spec.get("env") or {}).items()})
    try:
        cols = max(2, min(int(spec.get("cols", 80)), 500))
        rows = max(1, min(int(spec.get("rows", 24)), 500))
    except (TypeError, ValueError):
        emit_status({"type": "error", "message": "invalid cols/rows"})
        return 2

    try:
        pid, master_fd = pty.fork()
    except OSError as exc:
        emit_status({"type": "error", "message": f"pty.fork failed: {exc}"})
        return 2

    if pid == 0:
        # 子プロセス: 制御端末付きでコマンドを実行
        try:
            if cwd:
                os.chdir(cwd)
            os.environ.clear()
            os.environ.update(env)
            os.execvpe(command[0], command, env)
        except Exception as exc:  # noqa: BLE001
            emit_status({"type": "error", "message": f"exec failed: {exc}"})
            os._exit(127)

    set_winsize(master_fd, cols, rows)
    try:
        os.set_blocking(master_fd, False)
        os.set_blocking(0, False)
    except OSError:
        pass

    selector = selectors.DefaultSelector()
    selector.register(master_fd, selectors.EVENT_READ, "pty")
    selector.register(0, selectors.EVENT_READ, "ctrl")

    ctrl_buffer = b""
    exit_info = None

    def stop():
        nonlocal exit_info
        if exit_info is None:
            exit_info = {}

    def kill_child_group(sig=signal.SIGTERM):
        try:
            os.killpg(pid, sig)
        except OSError:
            pass

    def handle_signal(_signum, _frame):
        kill_child_group()
        stop()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGHUP, handle_signal)

    while exit_info is None:
        try:
            events = selector.select(timeout=1.0)
        except InterruptedError:
            continue
        for key, _mask in events:
            if key.data == "pty":
                try:
                    data = os.read(master_fd, MAX_IO)
                except OSError as exc:
                    if exc.errno in (errno.EIO, errno.EINVAL):
                        stop()
                        break
                    if exc.errno == errno.EAGAIN:
                        continue
                    raise
                if not data:
                    stop()
                    break
                write_bytes(sys.stdout.buffer, data)
                continue

            # 制御チャンネル (stdin)
            try:
                chunk = os.read(0, MAX_IO)
            except OSError as exc:
                if exc.errno == errno.EAGAIN:
                    continue
                raise
            if not chunk:
                # Node 側が切断: 子プロセスも終了させる
                kill_child_group()
                stop()
                break
            ctrl_buffer += chunk
            while b"\n" in ctrl_buffer:
                line, ctrl_buffer = ctrl_buffer.split(b"\n", 1)
                line = line.strip()
                if not line:
                    continue
                try:
                    message = json.loads(line.decode("utf-8"))
                except Exception:  # noqa: BLE001
                    emit_status({"type": "error", "message": "invalid control message"})
                    continue
                msg_type = message.get("type")
                if msg_type == "input":
                    try:
                        payload = base64.b64decode(message.get("data") or "", validate=True)
                    except Exception:  # noqa: BLE001
                        emit_status({"type": "error", "message": "invalid base64 input"})
                        continue
                    if not payload:
                        continue
                    try:
                        os.write(master_fd, payload)
                    except OSError as exc:
                        if exc.errno == errno.EIO:
                            stop()
                        elif exc.errno != errno.EAGAIN:
                            raise
                elif msg_type == "resize":
                    try:
                        new_cols = max(2, min(int(message.get("cols", 80)), 500))
                        new_rows = max(1, min(int(message.get("rows", 24)), 500))
                    except (TypeError, ValueError):
                        emit_status({"type": "error", "message": "invalid resize"})
                        continue
                    set_winsize(master_fd, new_cols, new_rows)
                elif msg_type == "kill":
                    kill_child_group()
                    stop()
                else:
                    emit_status({"type": "error", "message": f"unknown control: {msg_type}"})

    # 後始末: 子プロセスの終了を待ち、終了コードを報告する
    # (master を閉じる前に reap しないと SIGHUP が先に届き、終了コードが化ける)
    status = 0
    try:
        waited_pid, status = os.waitpid(pid, os.WNOHANG)
        if waited_pid == 0:
            kill_child_group()
            deadline = time.monotonic() + 2.0
            while True:
                waited_pid, status = os.waitpid(pid, os.WNOHANG)
                if waited_pid != 0:
                    break
                if time.monotonic() >= deadline:
                    kill_child_group(signal.SIGKILL)
                    waited_pid, status = os.waitpid(pid, 0)
                    break
                time.sleep(0.05)
    except ChildProcessError:
        status = 0

    try:
        os.close(master_fd)
    except OSError:
        pass
    selector.close()

    code = 1
    if os.WIFEXITED(status):
        code = os.WEXITSTATUS(status)
    elif os.WIFSIGNALED(status):
        code = 128 + os.WTERMSIG(status)
    emit_status({"type": "exit", "code": code})
    return 0


if __name__ == "__main__":
    sys.exit(main())
