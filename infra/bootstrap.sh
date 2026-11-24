#!/usr/bin/env bash
# Bootstrap the remote Terraform state backend (S3 bucket + DynamoDB lock table).
#
# Usage:
#   ./bootstrap.sh <state-bucket-name> [aws-region] [lock-table-name]
#
# Example:
#   ./bootstrap.sh my-org-terraform-state us-east-1 terraform-locks
#
# This script is idempotent: it creates the bucket/table only if they do not
# already exist. After running it, update the backend block in infra/main.tf
# with the bucket name and region, then run `terraform init -migrate-state`.

set -euo pipefail

BUCKET="${1:-}"
REGION="${2:-us-east-1}"
LOCK_TABLE="${3:-terraform-locks}"

if [[ -z "${BUCKET}" ]]; then
  echo "Usage: $0 <state-bucket-name> [aws-region] [lock-table-name]" >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "Error: AWS CLI (aws) is required but not installed." >&2
  exit 1
fi

echo "==> Ensuring S3 state bucket '${BUCKET}' exists in ${REGION}"
if aws s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
  echo "    Bucket already exists, skipping creation."
else
  if [[ "${REGION}" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}"
  else
    aws s3api create-bucket \
      --bucket "${BUCKET}" \
      --region "${REGION}" \
      --create-bucket-configuration LocationConstraint="${REGION}"
  fi
fi

echo "==> Enabling versioning on '${BUCKET}'"
aws s3api put-bucket-versioning \
  --bucket "${BUCKET}" \
  --versioning-configuration Status=Enabled

echo "==> Enabling default server-side encryption on '${BUCKET}'"
aws s3api put-bucket-encryption \
  --bucket "${BUCKET}" \
  --server-side-encryption-configuration '{
    "Rules": [
      {
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "AES256"
        }
      }
    ]
  }'

echo "==> Blocking public access on '${BUCKET}'"
aws s3api put-public-access-block \
  --bucket "${BUCKET}" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo "==> Ensuring DynamoDB lock table '${LOCK_TABLE}' exists"
if aws dynamodb describe-table --table-name "${LOCK_TABLE}" --region "${REGION}" >/dev/null 2>&1; then
  echo "    Lock table already exists, skipping creation."
else
  aws dynamodb create-table \
    --table-name "${LOCK_TABLE}" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${REGION}"
fi

echo
echo "Backend resources are ready."
echo "Next steps:"
echo "  1. Update the backend block in infra/main.tf:"
echo "       bucket         = \"${BUCKET}\""
echo "       region         = \"${REGION}\""
echo "       dynamodb_table = \"${LOCK_TABLE}\""
echo "  2. Run: cd infra && terraform init -migrate-state"
