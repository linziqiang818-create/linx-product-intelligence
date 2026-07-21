import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { minimumFormalAdmission } from "../app/formal-admission.ts";
import { classifyFormalProduct } from "../app/product-placement.ts";

type Candidate = { asin:string; title:string; amazonUrl:string; discoveryKeyword?:string; discoverySource?:string; category?:string; price?:number; imageUrl?:string; imageEvidence?:unknown; discoveredAt?:string; track?:string; preliminaryPriority?:{ score?:number; disposition?:string; reasons?:string[] } };
type JsonRecord = Record<string, unknown> & { asin:string };

const root = resolve(import.meta.dirname, "..");
const paths = { candidates:resolve(root,"app/candidate-pool.json"), products:resolve(root,"app/real-products.json"), rejected:resolve(root,"app/rejected-products.json"), state:resolve(root,"app/acquisition-state.json") };
const ranAt = process.argv[2] ?? new Date().toISOString();
const scheduledBatch = process.argv.includes("--batch");
const readJson = <T>(path:string) => JSON.parse(readFileSync(path,"utf8")) as T;
const writeJson = (path:string,value:unknown) => writeFileSync(path,`${JSON.stringify(value,null,2)}\n`,"utf8");

const candidates=readJson<Candidate[]>(paths.candidates), products=readJson<JsonRecord[]>(paths.products), rejected=readJson<JsonRecord[]>(paths.rejected), state=readJson<Record<string,unknown>>(paths.state);
const formalAsins=new Set(products.map(p=>p.asin)), rejectedAsins=new Set(rejected.map(p=>p.asin));
const remaining:Candidate[]=[], promoted:JsonRecord[]=[], newlyRejected:JsonRecord[]=[];
let duplicates=0;

for(const candidate of candidates){
  if(formalAsins.has(candidate.asin)||rejectedAsins.has(candidate.asin)){duplicates++;continue;}
  const placement=classifyFormalProduct({asin:candidate.asin,title:candidate.title,category:candidate.category,price:candidate.price,sourceUrl:candidate.amazonUrl},"candidate-enrichment");
  const admission=minimumFormalAdmission(candidate,placement.grade==="D");
  const evidence={kind:"public-discovery-record",sourceUrl:candidate.discoverySource,observedAt:candidate.discoveredAt,confidence:"medium"};
  if(placement.grade==="D"){
    newlyRejected.push({asin:candidate.asin,title:candidate.title,category:candidate.category??"",...(candidate.price===undefined?{}:{price:candidate.price}),sourceUrl:admission.canonicalAmazonUrl,discoveryKeyword:candidate.discoveryKeyword,discoverySource:candidate.discoverySource,observedAt:candidate.discoveredAt,movedToTrashAt:ranAt,grade:"D",rejectionReason:placement.reasons.join("；"),admissionEvidence:evidence});
    rejectedAsins.add(candidate.asin);continue;
  }
  if(!admission.eligible){remaining.push(candidate);continue;}
  promoted.push({asin:candidate.asin,title:candidate.title,category:candidate.category??"",...(candidate.price===undefined?{}:{price:candidate.price}),imageUrl:candidate.imageUrl,imageEvidence:candidate.imageEvidence,sourceUrl:admission.canonicalAmazonUrl,importedAt:ranAt,observedAt:candidate.discoveredAt,discoveryKeyword:candidate.discoveryKeyword,discoverySource:candidate.discoverySource,admissionEvidence:evidence,grade:placement.grade,track:placement.opportunityTrack??"unmatched",dataStatus:"needs_data",dataPendingReasons:[...(candidate.price===undefined?["price"]:[]),"rating","reviews","bsr","boughtPastMonth","dimensions","weight","material","dateFirstAvailable"],complexity:3,differentiation:(candidate.preliminaryPriority?.score??0)>=58?4:3,returnRisk:"中",note:"按最低正式入库门槛由公开发现记录转入；已确认真实 ASIN、完整英文标题、Amazon 美国站标准链接、真实公开主图、初步类目与可追溯公开来源。未确认字段保持数据待补，未填 0 或推测值。"});
  formalAsins.add(candidate.asin);
}

const formalBefore=products.length,rejectedBefore=rejected.length,nextProducts=[...products,...promoted],nextRejected=[...rejected,...newlyRejected];
const calendarDate = (value:string) => value.slice(0,10).split("-").map(Number);
const [startYear,startMonth,startDay]=calendarDate(String(state.startedAt));
const [runYear,runMonth,runDay]=calendarDate(ranAt);
const sprintDay=Math.max(1,Math.floor((Date.UTC(runYear,runMonth-1,runDay)-Date.UTC(startYear,startMonth-1,startDay))/86_400_000)+1);
state.enriched=Number(state.enriched??0)+promoted.length+newlyRejected.length;
state.activeImported=Number(state.activeImported??0)+promoted.length;
state.movedToTrash=Number(state.movedToTrash??0)+newlyRejected.length;
if(!scheduledBatch)state.lastAdmissionBackfill={ranAt,sprintDay,candidateReviewed:candidates.length,activeImported:promoted.length,movedToTrash:newlyRejected.length,duplicates,candidateRemaining:remaining.length,formalBefore,formalAfter:nextProducts.length,rejectedBefore,rejectedAfter:nextRejected.length,note:"User-approved minimum formal admission backfill; does not consume a scheduled batch quota."};
writeJson(paths.products,nextProducts);writeJson(paths.rejected,nextRejected);writeJson(paths.candidates,remaining);writeJson(paths.state,state);
process.stdout.write(`${JSON.stringify({candidateReviewed:candidates.length,promoted:promoted.length,newlyRejected:newlyRejected.length,duplicates,candidateRemaining:remaining.length,formalBefore,formalAfter:nextProducts.length,rejectedBefore,rejectedAfter:nextRejected.length},null,2)}\n`);
