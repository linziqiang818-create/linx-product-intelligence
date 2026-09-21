// 旧代码 company-calibration.ts 里用户已确认的校准样本，转成第二大脑的初始偏好事件。
// 这些只是产品级意愿信号，不是硬性规则。

const AT = "2026-07-15T00:00:00+08:00";

const roundOne = [
  ["B0G4HKTHJX", "cal_reject"], ["B0FDGHM391", "cal_develop"], ["B0GH651S4V", "cal_uncertain"], ["B0GJSV5B5T", "cal_reject"],
  ["B0FSZV4H21", "cal_develop"], ["B0F6CNTRHW", "cal_develop"], ["B0FCMBRH91", "cal_develop"], ["B0DN13DKK5", "cal_develop"],
  ["B0GYCYSDNN", "cal_develop"], ["B0GHRLD6VG", "cal_reject"], ["B0G2SL7CWK", "cal_develop"], ["B0DL5Q9319", "cal_develop"],
  ["B0GM6FJRWK", "cal_reject"], ["B0GGMCB4V3", "cal_reject"],
];

const roundTwo = [
  ["B0FR8R2QV7", "normal"], ["B0FJ2H1DG6", "low"], ["B0DWFGYWLN", "normal"], ["B0GWR1M1CX", "low"], ["B0DWMNGBKD", "normal"],
  ["B0FKTML5HX", "normal"], ["B0DF2CDWPF", "normal"], ["B0F6BP73WJ", "priority"], ["B0D78W597V", "normal"], ["B0C68MNQ1K", "normal"],
  ["B0F2SZCWSP", "normal"], ["B0DQPXHV82", "priority"], ["B0F2H5FNPJ", "low"], ["B0GR3V3WDP", "normal"],
];

const research = ["B0F6BP73WJ", "B0DQPXHV82", "B0FDGHM391", "B0FSZV4H21", "B0F6CNTRHW", "B0FCMBRH91", "B0DN13DKK5", "B0GYCYSDNN", "B0DL5Q9319", "B0GTKYY5YJ", "B0DWFGYWLN", "B0GZ7ZGLY8", "B0DRRTR25P"];
const secondary = ["B0H4Q13TCT", "B0DZ5CHFZM", "B0FJ83YQ3H", "B0GDW6562N", "B0CDWGVNQT"];
const pass = ["B0GH651S4V", "B0DZ6DK5MM", "B0H1MBRW2G", "B0DHVR9HSM", "B0FX4K9TQY", "B0C1ZBWY2K", "B0DG5T64TF", "B0GXKNSYGT", "B0FN3T3KQ2", "B0GZMP2S5F", "B0GWR1M1CX", "B0BHWBZ94J", "B0F93P2QMD", "B0F2SZCWSP"];

export function calibrationPriorEvents() {
  const events = [];
  for (const [asin, action] of roundOne) events.push({ asin, action, at: AT });
  for (const [asin, interest] of roundTwo) {
    events.push({ asin, action: "cal_develop", at: AT });
    if (interest === "priority") events.push({ asin, action: "cal_priority", at: AT });
    if (interest === "low") events.push({ asin, action: "cal_low", at: AT });
  }
  for (const asin of research) events.push({ asin, action: "pref_research", at: AT });
  for (const asin of secondary) events.push({ asin, action: "pref_secondary", at: AT });
  for (const asin of pass) events.push({ asin, action: "pref_pass", at: AT });
  return events;
}
