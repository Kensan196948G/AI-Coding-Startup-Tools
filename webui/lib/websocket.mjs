// WebUI セッション用 WebSocket サーバー実装 (RFC 6455, 依存パッケージなし)
// サーバー側 (Node) が利用する最小実装。クライアントフレームの解析・
// マスク解除・フラグメンテーション・制御フレーム・ハートビートを処理する。

import crypto from "node:crypto";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const OP_CONT = 0x0;
const OP_TEXT = 0x1;
const OP_BINARY = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

export class WebSocketProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WebSocketProtocolError";
    this.code = code;
  }
}

/** RFC 6455 Sec-WebSocket-Accept の計算 */
export function acceptKey(key) {
  return crypto.createHash("sha1").update(`${key}${WS_GUID}`).digest("base64");
}

/** サーバー→クライアントのフレームを組み立てる (マスクなし) */
export function encodeFrame(opcode, payload, fin = true) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), "utf8");
  const header = [(fin ? 0x80 : 0x00) | opcode];
  const length = data.length;
  if (length <= 125) {
    header.push(length);
  } else if (length <= 0xffff) {
    header.push(126, (length >>> 8) & 0xff, length & 0xff);
  } else {
    const hi = Math.floor(length / 0x100000000);
    const lo = length >>> 0;
    header.push(127);
    const big = Buffer.alloc(8);
    big.writeUInt32BE(hi, 0);
    big.writeUInt32BE(lo, 4);
    return Buffer.concat([Buffer.from(header), big, data]);
  }
  return Buffer.concat([Buffer.from(header), data]);
}

function closePayload(code, reason) {
  const reasonBuf = Buffer.from(String(reason || ""), "utf8");
  const buf = Buffer.alloc(2 + reasonBuf.length);
  buf.writeUInt16BE(code, 0);
  reasonBuf.copy(buf, 2);
  return buf;
}

export function parseClosePayload(data) {
  if (!data || data.length === 0) {
    return { code: 1005, reason: "" };
  }
  if (data.length === 1) {
    throw new WebSocketProtocolError(1002, "close フレームのペイロード長が不正です");
  }
  const code = data.readUInt16BE(0);
  if (code < 1000 || code > 4999 || code === 1004 || code === 1005 || code === 1006 || code === 1015) {
    throw new WebSocketProtocolError(1002, `不正な close コードです: ${code}`);
  }
  return { code, reason: data.subarray(2).toString("utf8") };
}

/**
 * 受信バッファから WebSocket メッセージを切り出すデコーダ。
 * フラグメンテーションの状態を内部に持つため、チャンク単位で push して使う。
 */
export class FrameDecoder {
  constructor({ maxPayload = 262144, requireMasked = true } = {}) {
    this.maxPayload = maxPayload;
    this.requireMasked = requireMasked;
    this.buffer = Buffer.alloc(0);
    this.messageOpcode = null;
    this.fragments = [];
    this.fragmentLength = 0;
  }

  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const messages = [];
    for (;;) {
      const message = this._tryParse();
      if (message === null) {
        break;
      }
      messages.push(message);
    }
    return messages;
  }

  _tryParse() {
    if (this.buffer.length < 2) {
      return null;
    }
    const b0 = this.buffer[0];
    const b1 = this.buffer[1];
    const fin = (b0 & 0x80) !== 0;
    const rsv = b0 & 0x70;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let length = b1 & 0x7f;
    let offset = 2;

    if (rsv !== 0) {
      throw new WebSocketProtocolError(1002, "RSV ビットは未使用です");
    }
    if (this.requireMasked && !masked) {
      throw new WebSocketProtocolError(1002, "クライアントフレームはマスク必須です");
    }
    const isControl = opcode >= 0x8;
    if (isControl && (!fin || length > 125)) {
      throw new WebSocketProtocolError(1002, "制御フレームは FIN=1 かつ 125 バイト以下が必要です");
    }
    if (opcode !== OP_CONT && opcode !== OP_TEXT && opcode !== OP_BINARY &&
        opcode !== OP_CLOSE && opcode !== OP_PING && opcode !== OP_PONG) {
      throw new WebSocketProtocolError(1002, `不明な opcode です: ${opcode}`);
    }

    if (length === 126) {
      if (this.buffer.length < offset + 2) {
        return null;
      }
      length = this.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (this.buffer.length < offset + 8) {
        return null;
      }
      const big = this.buffer.readBigUInt64BE(offset);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new WebSocketProtocolError(1009, "ペイロードが大きすぎます");
      }
      length = Number(big);
      offset += 8;
    }
    if (length > this.maxPayload) {
      throw new WebSocketProtocolError(1009, "ペイロードが大きすぎます");
    }
    if (masked) {
      if (this.buffer.length < offset + 4) {
        return null;
      }
      offset += 4;
    }
    const total = offset + length;
    if (this.buffer.length < total) {
      return null;
    }

    const payload = Buffer.from(this.buffer.subarray(offset, total));
    if (masked) {
      const maskKey = this.buffer.subarray(offset - 4, offset);
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i & 3];
      }
    }
    this.buffer = this.buffer.subarray(total);

    if (isControl) {
      if (opcode === OP_CLOSE) {
        return { type: "close", data: payload };
      }
      if (opcode === OP_PING) {
        return { type: "ping", data: payload };
      }
      return { type: "pong", data: payload };
    }

    if (opcode === OP_CONT) {
      if (this.messageOpcode === null) {
        throw new WebSocketProtocolError(1002, "継続フレームに対応する開始フレームがありません");
      }
      this.fragments.push(payload);
      this.fragmentLength += payload.length;
      if (this.fragmentLength > this.maxPayload) {
        throw new WebSocketProtocolError(1009, "ペイロードが大きすぎます");
      }
      if (!fin) {
        return null;
      }
      const kind = this.messageOpcode === OP_TEXT ? "text" : "binary";
      const full = Buffer.concat(this.fragments, this.fragmentLength);
      this.messageOpcode = null;
      this.fragments = [];
      this.fragmentLength = 0;
      return { type: kind, data: full };
    }

    if (opcode === OP_TEXT || opcode === OP_BINARY) {
      if (this.messageOpcode !== null) {
        throw new WebSocketProtocolError(1002, "継続中に新しいデータフレームが開始されました");
      }
      if (fin) {
        return { type: opcode === OP_TEXT ? "text" : "binary", data: payload };
      }
      this.messageOpcode = opcode;
      this.fragments = [payload];
      this.fragmentLength = payload.length;
      return null;
    }
    return null;
  }
}

/** WebSocket 接続 1 本を表す (サーバー側) */
export class WebSocketConnection {
  constructor(socket, options = {}) {
    this.socket = socket;
    this.maxPayload = options.maxPayload || 262144;
    this.heartbeatMs = options.heartbeatMs || 30000;
    this.highWater = options.highWater || 1024 * 1024;
    this.onText = options.onText || null;
    this.onBinary = options.onBinary || null;
    this.onClose = options.onClose || null;
    this.onError = options.onError || null;
    this.onBackpressure = options.onBackpressure || null;
    this.closed = false;
    this.closeSent = false;
    this.closeTimer = null;
    this.heartbeatTimer = null;
    this.decoder = new FrameDecoder({ maxPayload: this.maxPayload });
    this.lastPong = Date.now();
    this.backpressured = false;

    this._onData = this._onData.bind(this);
    this._onError = this._onError.bind(this);
    this._onSocketClose = this._onSocketClose.bind(this);
    this._checkBackpressure = this._checkBackpressure.bind(this);

    socket.on("data", this._onData);
    socket.on("error", this._onError);
    socket.on("close", this._onSocketClose);
    socket.on("drain", this._checkBackpressure);

    if (options.initialData && options.initialData.length) {
      this._onData(options.initialData);
    }
    this._startHeartbeat();
  }

  _onData(chunk) {
    if (this.closed) {
      return;
    }
    try {
      for (const message of this.decoder.push(chunk)) {
        this._dispatch(message);
      }
    } catch (error) {
      const code = error && error.code ? error.code : 1002;
      this.close(code, (error && error.message) || "プロトコルエラー");
    }
  }

  _dispatch(message) {
    this.lastPong = Date.now();
    if (message.type === "text") {
      if (this.onText) this.onText(message.data.toString("utf8"));
      return;
    }
    if (message.type === "binary") {
      if (this.onBinary) this.onBinary(message.data);
      return;
    }
    if (message.type === "ping") {
      this._sendFrame(OP_PONG, message.data);
      return;
    }
    if (message.type === "pong") {
      return;
    }
    if (message.type === "close") {
      const parsed = parseClosePayload(message.data);
      if (!this.closeSent) {
        this.closeSent = true;
        this._sendFrame(OP_CLOSE, closePayload(parsed.code === 1005 ? 1000 : parsed.code, parsed.reason));
      }
      this.destroy();
    }
  }

  sendText(text) {
    if (!this.closed) this._sendFrame(OP_TEXT, Buffer.from(String(text), "utf8"));
  }

  sendBinary(data) {
    if (!this.closed) this._sendFrame(OP_BINARY, data);
  }

  sendPing() {
    if (!this.closed) this._sendFrame(OP_PING, Buffer.alloc(0));
  }

  close(code = 1000, reason = "") {
    if (this.closed) return;
    if (!this.closeSent) {
      this.closeSent = true;
      this._sendFrame(OP_CLOSE, closePayload(code, reason));
    }
    if (this.closeTimer === null) {
      this.closeTimer = setTimeout(() => this.destroy(), 5000);
      this.closeTimer.unref?.();
    }
  }

  destroy() {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.socket.removeListener("data", this._onData);
    this.socket.removeListener("error", this._onError);
    this.socket.removeListener("close", this._onSocketClose);
    this.socket.removeListener("drain", this._checkBackpressure);
    try {
      this.socket.destroy();
    } catch {
      // 無視
    }
    if (this.onClose) this.onClose();
  }

  _onError(error) {
    if (this.onError) this.onError(error);
    this.destroy();
  }

  _onSocketClose() {
    this.destroy();
  }

  _sendFrame(opcode, payload) {
    if (this.closed) return;
    try {
      this.socket.write(encodeFrame(opcode, payload));
    } catch {
      this.destroy();
      return;
    }
    this._checkBackpressure();
  }

  _checkBackpressure() {
    const level = this.socket.writableLength || 0;
    const paused = level > this.highWater;
    if (paused !== this.backpressured) {
      this.backpressured = paused;
      if (this.onBackpressure) this.onBackpressure(paused);
    }
  }

  _startHeartbeat() {
    if (!this.heartbeatMs || this.heartbeatMs <= 0) return;
    this.heartbeatTimer = setInterval(() => {
      if (this.closed) return;
      if (Date.now() - this.lastPong > this.heartbeatMs * 2) {
        this.close(1001, "heartbeat timeout");
      } else {
        this.sendPing();
      }
    }, this.heartbeatMs);
    this.heartbeatTimer.unref?.();
  }
}

/**
 * HTTP リクエストを WebSocket へアップグレードする。
 * 成功時は WebSocketConnection を返し、失敗時は 400 を書いて null を返す。
 */
export function performUpgrade(req, socket, head, options = {}) {
  const key = req.headers["sec-websocket-key"];
  const version = req.headers["sec-websocket-version"];
  const upgrade = String(req.headers.upgrade || "").toLowerCase();
  const connection = String(req.headers.connection || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim());
  if (
    req.method !== "GET" ||
    upgrade !== "websocket" ||
    !connection.includes("upgrade") ||
    version !== "13" ||
    typeof key !== "string" ||
    !key
  ) {
    socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    socket.destroy();
    return null;
  }
  const accept = acceptKey(key);
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  return new WebSocketConnection(socket, {
    ...options,
    initialData: head && head.length ? head : null,
  });
}
