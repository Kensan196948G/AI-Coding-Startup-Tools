import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  acceptKey,
  encodeFrame,
  FrameDecoder,
  WebSocketConnection,
} from "../../webui/lib/websocket.mjs";

function maskedFrame(opcode, fin, payload, mask = [0x01, 0x02, 0x03, 0x04]) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8");
  const masked = Buffer.from(data);
  for (let i = 0; i < masked.length; i++) {
    masked[i] ^= mask[i & 3];
  }
  const header = [(fin ? 0x80 : 0x00) | opcode, 0x80 | data.length];
  return Buffer.concat([Buffer.from(header), Buffer.from(mask), masked]);
}

test("acceptKey は RFC 6455 のサンプルベクタと一致する", () => {
  assert.equal(
    acceptKey("dGhlIHNhbXBsZSBub25jZQ=="),
    "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=",
  );
});

test("encodeFrame はテキストフレームを組み立てる", () => {
  const frame = encodeFrame(0x1, Buffer.from("Hello"));
  assert.deepEqual([...frame.subarray(0, 2)], [0x81, 0x05]);
  assert.equal(frame.subarray(2).toString("utf8"), "Hello");
});

test("encodeFrame は 126 バイト超のペイロード長を拡張形式で書く", () => {
  const payload = Buffer.alloc(200, 0x61);
  const frame = encodeFrame(0x2, payload);
  assert.deepEqual([...frame.subarray(0, 4)], [0x82, 126, 0x00, 0xc8]);
  assert.equal(frame.length, 204);
});

test("FrameDecoder はマスク済みクライアントフレームを復号する", () => {
  const decoder = new FrameDecoder();
  // RFC 6455 5.7 の "Hello" の例
  const messages = decoder.push(
    Buffer.from([0x81, 0x85, 0x37, 0xfa, 0x21, 0x3d, 0x7f, 0x9f, 0x4d, 0x51, 0x58]),
  );
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "text");
  assert.equal(messages[0].data.toString("utf8"), "Hello");
});

test("FrameDecoder はフラグメンテーションを結合する", () => {
  const decoder = new FrameDecoder();
  assert.deepEqual(decoder.push(maskedFrame(0x1, false, "Hel")), []);
  const messages = decoder.push(maskedFrame(0x0, true, "lo"));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "text");
  assert.equal(messages[0].data.toString("utf8"), "Hello");
});

test("FrameDecoder は制御フレームの長さ制限 (125) を適用する", () => {
  const decoder = new FrameDecoder();
  const frame = Buffer.concat([
    Buffer.from([0x89, 0x80, 0x00, 0x00, 0x00, 0x00]),
    Buffer.alloc(126, 0x00),
  ]);
  assert.throws(() => decoder.push(frame), (error) => error.code === 1002);
});

test("FrameDecoder はマスク必須を適用する", () => {
  const decoder = new FrameDecoder();
  assert.throws(
    () => decoder.push(Buffer.from([0x81, 0x01, 0x41])),
    (error) => error.code === 1002,
  );
});

test("FrameDecoder はペイロード上限を適用する", () => {
  const decoder = new FrameDecoder({ maxPayload: 4 });
  assert.throws(
    () => decoder.push(maskedFrame(0x1, true, "Hello")),
    (error) => error.code === 1009,
  );
});

test("WebSocketConnection は ping に対して pong を返す", () => {
  const written = [];
  const socket = new EventEmitter();
  socket.writableLength = 0;
  socket.write = (chunk) => {
    written.push(chunk);
    return true;
  };
  socket.destroy = () => {
    socket.destroyed = true;
  };

  const connection = new WebSocketConnection(socket, { heartbeatMs: 0 });
  socket.emit("data", Buffer.from([0x89, 0x80, 0x00, 0x00, 0x00, 0x00]));

  const pong = Buffer.concat(written);
  assert.deepEqual([...pong.subarray(0, 2)], [0x8a, 0x00]);
  connection.destroy();
});

test("WebSocketConnection は close フレームを受信すると close を返して破棄する", () => {
  const written = [];
  const socket = new EventEmitter();
  socket.writableLength = 0;
  socket.write = (chunk) => {
    written.push(chunk);
    return true;
  };
  socket.destroy = () => {
    socket.destroyed = true;
  };

  let closed = false;
  const connection = new WebSocketConnection(socket, {
    heartbeatMs: 0,
    onClose: () => {
      closed = true;
    },
  });
  // マスク済み close フレーム (code=1000)
  socket.emit(
    "data",
    maskedFrame(0x8, true, Buffer.from([0x03, 0xe8]), [0x00, 0x00, 0x00, 0x00]),
  );

  const close = Buffer.concat(written);
  assert.equal(close[0], 0x88);
  assert.equal(close.readUInt16BE(2), 1000);
  assert.equal(closed, true);
  assert.equal(connection.closed, true);
});
