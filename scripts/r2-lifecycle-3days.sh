#!/usr/bin/env bash
# R2 — tự xóa file sau 3 ngày (Cloudflare lifecycle).
# Buckets: ai-web (motion + kaling), xiaoyang-direct-media (nhay.cloud worker)
# Chạy: bash scripts/r2-lifecycle-3days.sh
set -euo pipefail

DAYS="${R2_RETENTION_DAYS:-3}"
BUCKETS="${R2_LIFECYCLE_BUCKETS:-ai-web xiaoyang-direct-media}"

cd "$(dirname "$0")/.."

apply_bucket() {
  local bucket="$1"
  echo "==> Bucket: $bucket"
  for old in delete_after_7_days_results delete_after_7_days_characters delete_after_7_days_motions \
             delete_after_3_days_results delete_after_3_days_characters delete_after_3_days_motions; do
    npx wrangler r2 bucket lifecycle remove "$bucket" --id "$old" 2>/dev/null || true
  done
  npx wrangler r2 bucket lifecycle add "$bucket" --id "delete_after_${DAYS}_days_results" --prefix results/ --expire-days "$DAYS"
  npx wrangler r2 bucket lifecycle add "$bucket" --id "delete_after_${DAYS}_days_characters" --prefix characters/ --expire-days "$DAYS"
  npx wrangler r2 bucket lifecycle add "$bucket" --id "delete_after_${DAYS}_days_motions" --prefix motions/ --expire-days "$DAYS"
  npx wrangler r2 bucket lifecycle list "$bucket"
}

for b in $BUCKETS; do
  apply_bucket "$b"
done
