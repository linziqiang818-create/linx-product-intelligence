import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

type Product = { asin:string; discoverySource?:string; imageUrl?:string };
type Found = { asin:string; imageUrl?:string; sourceUrl?:string; reason?:string };

const products=JSON.parse(readFileSync(new URL("../app/real-products.json",import.meta.url),"utf8")) as Product[];
const candidatePath=new URL("../app/candidate-pool.json",import.meta.url);
const candidates=JSON.parse(readFileSync(candidatePath,"utf8")) as Product[];
const targets=[...products,...candidates].filter(product=>!product.imageUrl&&product.discoverySource);
const applyChanges=process.argv.includes("--apply");

function decode(value:string){return value.replaceAll("\\u0026","&").replaceAll("\\/","/").replaceAll("&amp;","&");}

function algopixMain(html:string,asin:string){
  const pattern=new RegExp(`"imageType":"MAIN","imageUrl":"([^"]*?/image/${asin}/[^"]+)"(?:,"imageHeight":\\{"value":(\\d+)[^}]*\\},"imageWidth":\\{"value":(\\d+))?`,`g`);
  const matches=[...html.matchAll(pattern)].map(match=>({url:decode(match[1]),area:Number(match[2]??0)*Number(match[3]??0)}));
  return matches.sort((a,b)=>b.area-a.area)[0]?.url;
}

function genericMain(html:string,asin:string){
  const amazon=[...html.matchAll(new RegExp(`https:[^"'<> ]+(?:m\\.media-amazon\\.com|images-na\\.ssl-images-amazon\\.com)[^"'<> ]*`,"g"))].map(match=>decode(match[0]));
  const asinImage=amazon.find(url=>url.includes(asin));
  if(asinImage)return asinImage;
  const meta=html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
  const metaUrl=meta?.[1]?decode(meta[1]):undefined;
  return metaUrl?.startsWith("http")&&metaUrl.includes(asin)?metaUrl:undefined;
}

const results:Found[]=[];
for(const product of targets){
  try{
    const response=await fetch(product.discoverySource!,{headers:{"user-agent":"Mozilla/5.0 (compatible; LINX public product research)"},signal:AbortSignal.timeout(30_000)});
    const html=response.ok?await response.text():"";
    let imageUrl=product.discoverySource!.includes("algopix.com/")?algopixMain(html,product.asin):genericMain(html,product.asin);
    let imageSource=product.discoverySource;
    if(!imageUrl){
      const fallbackUrl=`https://www.algopix.com/products/${product.asin}`;
      const fallback=await fetch(fallbackUrl,{headers:{"user-agent":"Mozilla/5.0 (compatible; LINX public product research)"},signal:AbortSignal.timeout(30_000)});
      if(fallback.ok){imageUrl=algopixMain(await fallback.text(),product.asin);if(imageUrl)imageSource=fallbackUrl;}
    }
    results.push(imageUrl?{asin:product.asin,imageUrl,sourceUrl:imageSource}:{asin:product.asin,sourceUrl:product.discoverySource,reason:response.ok?"no ASIN-linked MAIN image":`HTTP ${response.status}; fallback has no MAIN image`});
  }catch(error){results.push({asin:product.asin,sourceUrl:product.discoverySource,reason:error instanceof Error?error.message:"request failed"});}
}
if(applyChanges){
  const verified:Found[]=[];
  for(const result of results.filter(item=>item.imageUrl?.includes(`/image/${item.asin}/`)&&item.sourceUrl?.includes("algopix.com/"))){
    try{
      const response=await fetch(result.imageUrl!,{signal:AbortSignal.timeout(30_000)});
      if(response.ok&&response.headers.get("content-type")?.startsWith("image/"))verified.push(result);
    }catch{/* An unavailable image is not admitted. */}
  }
  const verifiedByAsin=new Map(verified.map(item=>[item.asin,item]));
  const unresolvedAsins=new Set(targets.filter(item=>!verifiedByAsin.has(item.asin)).map(item=>item.asin));
  const originalCandidates=JSON.parse(execFileSync("git",["show","6452ffd:app/candidate-pool.json"],{encoding:"utf8"})) as Array<Record<string,unknown>&{asin:string}>;
  const formerProducts=JSON.parse(execFileSync("git",["show","929a807:app/real-products.json"],{encoding:"utf8"})) as Array<Record<string,unknown>&{asin:string}>;
  const currentCandidates=JSON.parse(readFileSync(candidatePath,"utf8")) as Array<Record<string,unknown>&{asin:string}>;
  const candidateMap=new Map(currentCandidates.map(item=>[item.asin,item]));
  for(const original of originalCandidates)if(unresolvedAsins.has(original.asin))candidateMap.set(original.asin,original);
  for(const asin of verifiedByAsin.keys())candidateMap.delete(asin);

  const correctedExisting=products
    .filter(product=>!unresolvedAsins.has(product.asin))
    .map(product=>{
      const found=verifiedByAsin.get(product.asin);
      if(!found)return product;
      const dataPendingReasons=(product as Product&{dataPendingReasons?:string[]}).dataPendingReasons?.filter(reason=>reason!=="imageUrl");
      return {...product,imageUrl:found.imageUrl,imageEvidence:{kind:"public-catalog-main-image",sourceUrl:found.sourceUrl,observedAt:new Date().toISOString(),asin:product.asin},dataPendingReasons};
    });
  const existingAsins=new Set(correctedExisting.map(product=>product.asin));
  const restored=formerProducts.filter(product=>verifiedByAsin.has(product.asin)&&!existingAsins.has(product.asin)).map(product=>{
    const found=verifiedByAsin.get(product.asin)!;
    const reasons=Array.isArray(product.dataPendingReasons)?product.dataPendingReasons.filter(reason=>reason!=="imageUrl"):product.dataPendingReasons;
    return {...product,imageUrl:found.imageUrl,imageEvidence:{kind:"public-catalog-main-image",sourceUrl:found.sourceUrl,observedAt:new Date().toISOString(),asin:product.asin},dataPendingReasons:reasons};
  });
  const nextProducts=[...correctedExisting,...restored];
  const statePath=new URL("../app/acquisition-state.json",import.meta.url);
  const state=JSON.parse(readFileSync(statePath,"utf8")) as Record<string,unknown>;
  const unresolvedFormal=products.filter(product=>unresolvedAsins.has(product.asin)).length;
  state.activeImported=Math.max(0,Number(state.activeImported??0)-unresolvedFormal+restored.length);
  state.lastImageCorrection={ranAt:new Date().toISOString(),reviewed:targets.length,mainImagesAdded:verified.length,reEnteredFormalPool:restored.length,returnedToCandidatePool:unresolvedFormal,formalBefore:products.length,formalAfter:nextProducts.length,candidateAfter:candidateMap.size,reason:"Formal products require an ASIN-linked verified public main image."};
  writeFileSync(new URL("../app/real-products.json",import.meta.url),`${JSON.stringify(nextProducts,null,2)}\n`);
  writeFileSync(new URL("../app/candidate-pool.json",import.meta.url),`${JSON.stringify([...candidateMap.values()],null,2)}\n`);
  writeFileSync(statePath,`${JSON.stringify(state,null,2)}\n`);
  process.stdout.write(`${JSON.stringify({reviewed:targets.length,mainImagesAdded:verified.length,reEnteredFormalPool:restored.length,returnedToCandidatePool:unresolvedFormal,stillPending:candidateMap.size,formalBefore:products.length,formalAfter:nextProducts.length,candidateAfter:candidateMap.size},null,2)}\n`);
}else process.stdout.write(`${JSON.stringify(results,null,2)}\n`);
