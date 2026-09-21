// 访问密码：HTTP Basic 认证，供内网穿透等公网访问场景保护数据。
// 设置环境变量 LINX_USER / LINX_PASS 即启用；LINX_PASS 为空时不启用。
import { createHash, timingSafeEqual } from "node:crypto";

function credentialHash(user, pass) {
  return createHash("sha256").update(`${user}:${pass}`).digest();
}

export function createAuth({ user = process.env.LINX_USER || "linx", pass = process.env.LINX_PASS } = {}) {
  if (!pass) return null;
  const expected = credentialHash(user, pass);
  return function auth(req, res, next) {
    const [scheme, encoded] = (req.headers.authorization || "").split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      const colon = decoded.indexOf(":");
      if (colon > -1) {
        const actual = credentialHash(decoded.slice(0, colon), decoded.slice(colon + 1));
        if (timingSafeEqual(actual, expected)) return next();
      }
    }
    res.setHeader("WWW-Authenticate", 'Basic realm="LINX"');
    res.status(401).type("text; charset=utf-8").send("LINX 需要登录：请输入访问账号和密码。");
  };
}
