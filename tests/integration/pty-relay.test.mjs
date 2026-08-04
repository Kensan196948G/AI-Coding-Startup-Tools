import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const RELAY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../webui/lib/pty_relay.py",
);

function b64(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

/**
 * PTY リレーを起動し、制御メッセージを送って終了を待つ。
 * stdin は exit 受信まで開いたままにする。
 */
function runRelay(spec, control = []) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [RELAY, JSON.stringify(spec)], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = Buffer.alloc(0);
    let stderr = "";
    let exitEvent = null;
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      try {
        child.stdin.end();
      } catch {
        // 無視
      }
      if (error) {
        reject(error);
      } else {
        resolve({ stdout: stdout.toString("utf8"), exit: exitEvent });
      }
    };

    const timer = setTimeout(() => finish(new Error("PTY リレーがタイムアウトしました")), 10000);

    child.stdout.on("data", (chunk) => {
      stdout = Buffer.concat([stdout, chunk]);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      for (const line of stderr.split("\n")) {
        if (!line.trim()) continue;
        let status;
        try {
          status = JSON.parse(line);
        } catch {
          continue;
        }
        if (status.type === "exit") {
          exitEvent = status;
          clearTimeout(timer);
          finish();
        } else if (status.type === "error") {
          clearTimeout(timer);
          finish(new Error(status.message || "PTY リレーエラー"));
        }
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish(error);
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (!exitEvent) {
        finish(new Error(`PTY リレーが異常終了しました (stderr: ${stderr})`));
      }
    });

    for (const item of control) {
      setTimeout(() => {
        if (!child.stdin.destroyed) {
          child.stdin.write(JSON.stringify(item) + "\n");
        }
      }, item.delay ?? 0);
    }
  });
}

test("PTY リレーは出力を返し終了コードを報告する", async () => {
  const result = await runRelay({
    command: ["/bin/sh", "-c", "printf 'hello-pty\\n'; exit 3"],
    env: {},
  });
  assert.match(result.stdout, /hello-pty/);
  assert.equal(result.exit.code, 3);
});

test("PTY リレーは resize を反映する", async () => {
  const result = await runRelay(
    {
      command: ["/bin/sh", "-c", "sleep 0.4; stty size"],
      env: {},
    },
    [{ type: "resize", cols: 120, rows: 40, delay: 50 }],
  );
  assert.match(result.stdout, /40\s+120/);
});

test("PTY リレーは入力を子プロセスへ転送する", async () => {
  const result = await runRelay(
    {
      command: ["/bin/sh", "-c", "read line; printf 'got:%s\\n' \"$line\""],
      env: {},
    },
    [{ type: "input", data: b64("hello-pty\n"), delay: 100 }],
  );
  assert.match(result.stdout, /hello-pty/);
  assert.match(result.stdout, /got:hello-pty/);
});

test("PTY リレーは kill 制御で子プロセスを終了させる", async () => {
  const result = await runRelay(
    {
      command: ["/bin/sh", "-c", "trap 'exit 42' TERM; while :; do sleep 0.1; done"],
      env: {},
    },
    [{ type: "kill", delay: 300 }],
  );
  // trap が効けば 42、効かなければ 128 + SIGTERM(15) = 143
  assert.ok([42, 143].includes(result.exit.code));
});
