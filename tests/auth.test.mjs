import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuth } from "../server/auth.mjs";

function mockReq(headers = {}) {
  return { headers };
}

function mockRes() {
  const res = {
    headers: {},
    statusCode: 0,
    body: "",
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    type() {
      return this;
    },
    send(body) {
      this.body = body;
    },
  };
  return res;
}

function credentials(name, pass) {
  return "Basic " + Buffer.from(`${name}:${pass}`).toString("base64");
}

test("未设置密码时不启用认证", () => {
  assert.equal(createAuth({ pass: "" }), null);
  assert.equal(createAuth({ pass: undefined }), null);
});

test("正确账号密码放行", () => {
  const auth = createAuth({ user: "linx", pass: "secret" });
  let passed = false;
  auth(mockReq({ authorization: credentials("linx", "secret") }), mockRes(), () => {
    passed = true;
  });
  assert.ok(passed);
});

test("错误密码或未带凭据返回 401 并要求重新输入", () => {
  const auth = createAuth({ user: "linx", pass: "secret" });
  let passed = false;
  const next = () => {
    passed = true;
  };

  const wrongPass = mockRes();
  auth(mockReq({ authorization: credentials("linx", "wrong") }), wrongPass, next);
  assert.equal(wrongPass.statusCode, 401);

  const wrongUser = mockRes();
  auth(mockReq({ authorization: credentials("other", "secret") }), wrongUser, next);
  assert.equal(wrongUser.statusCode, 401);

  const noHeader = mockRes();
  auth(mockReq(), noHeader, next);
  assert.equal(noHeader.statusCode, 401);
  assert.match(noHeader.headers["WWW-Authenticate"], /Basic/);
  assert.equal(passed, false);
});

test("密码里带冒号也能通过", () => {
  const auth = createAuth({ user: "linx", pass: "a:b:c" });
  let passed = false;
  auth(mockReq({ authorization: credentials("linx", "a:b:c") }), mockRes(), () => {
    passed = true;
  });
  assert.ok(passed);
});
