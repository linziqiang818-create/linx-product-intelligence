import fs from "node:fs";

const file = new URL("../app/rejected-products.json", import.meta.url);
const products = JSON.parse(fs.readFileSync(file, "utf8"));

const verifiedImages = {
  B0C6THJH5X: {
    imageUrl: "https://manuals.plus/ae/1005006953106738/images/S4574e77ba0524899a1ed807ba1284abeq.jpg",
    sourceUrl: "https://manuals.plus/ae/1005006953106738",
    kind: "public-product-manual-image",
  },
  B0DF2G92HC: {
    imageUrl: "https://m.media-amazon.com/images/I/81BqFB5TfAL._AC_UY512_.jpg",
    sourceUrl: "https://www.asinsight.com/report/US/bookshelf-arched",
    kind: "public-ranking-product-image",
  },
  B0GCYDV9V8: {
    imageUrl: "https://images.price.tools/images/55-75-gallon-aquarium-stand-power-m-tZxER1rs.jpg",
    sourceUrl: "https://pricehistory.app/p/55-75-gallon-aquarium-stand-power-outlet-bVQitDSj",
    kind: "public-price-history-product-image",
  },
  B0DD664BYP: {
    imageUrl: "https://www.testmarket.io/storage/cat/blog/5511014f9573bba99b2b097c697b5b67.jpg",
    sourceUrl: "https://www.testmarket.io/proview/tables/multifunctional-sensory-table-with-2-chairs-paper-roll-wooden-sand-and-water-activity-table-with-double-sided-board-foldable-storage-bins-for-kids-indoor-and-outdoor-play/12524",
    kind: "public-review-product-image",
  },
  B0D77FZXG2: {
    imageUrl: "https://m.media-amazon.com/images/I/81eX4Y1DUlL._AC_US600_.jpg",
    sourceUrl: "https://uspto.report/TM/99172138/APP20250506170449/8.pdf",
    kind: "verified-product-family-image",
    relatedAsin: "B0DMT47JKY",
  },
  B0D28GBK64: {
    imageUrl: "https://images.price.tools/images/record-player-stand-vinyl-record-cabinet-m-GixRaWqs.jpg",
    sourceUrl: "https://pricehistory.app/p/record-player-stand-vinyl-record-cabinet-power-WDKv0wce",
    kind: "public-price-history-product-image",
  },
};

let updated = 0;
for (const product of products) {
  const evidence = verifiedImages[product.asin];
  if (!evidence || product.imageUrl) continue;
  product.imageUrl = evidence.imageUrl;
  product.imageEvidence = {
    kind: evidence.kind,
    sourceUrl: evidence.sourceUrl,
    asin: product.asin,
    ...(evidence.relatedAsin ? { relatedAsin: evidence.relatedAsin } : {}),
  };
  updated++;
}

fs.writeFileSync(file, `${JSON.stringify(products, null, 2)}\n`);
console.log(`Backfilled ${updated} verified rejected-product images.`);
