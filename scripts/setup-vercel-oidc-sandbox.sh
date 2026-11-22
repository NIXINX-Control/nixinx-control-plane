#!/usr/bin/env bash
# NIXINX Control SANDBOX ONLY. Idempotent Vercel OIDC -> GCP identity federation.
# This script changes no org policy, creates no service-account keys and touches no production projects.
set -euo pipefail
PROJECT="nixinx-control-sbx-26"
PROJECT_NUMBER="1080730147334"
POOL="vercel-control"
PROVIDER="nixinx-projects"
SERVICE_ACCOUNT="firebase-adminsdk-fbsvc@${PROJECT}.iam.gserviceaccount.com"
SUBJECT="owner:nixinx-projects:project:nixinx-control:environment:preview"
ISSUER="https://oidc.vercel.com/nixinx-projects"
AUDIENCE="https://vercel.com/nixinx-projects"

[[ "$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')" == "$PROJECT_NUMBER" ]] || { echo "STOP: wrong project";exit 1; }
gcloud iam service-accounts describe "$SERVICE_ACCOUNT" --project="$PROJECT" >/dev/null || { echo "STOP: Firebase admin service account not present";exit 1; }
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project="$PROJECT"

if ! gcloud iam workload-identity-pools describe "$POOL" --project="$PROJECT" --location=global >/dev/null 2>&1;then
 gcloud iam workload-identity-pools create "$POOL" --project="$PROJECT" --location=global --display-name="Vercel NIXINX Control Preview"
fi
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" --project="$PROJECT" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1;then
 gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
  --project="$PROJECT" --location=global --workload-identity-pool="$POOL" \
  --display-name="NIXINX Control Preview" \
  --issuer-uri="$ISSUER" --allowed-audiences="$AUDIENCE" \
  --attribute-mapping="google.subject=assertion.sub" \
  --attribute-condition="assertion.sub=='$SUBJECT'"
fi
gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" --project="$PROJECT" \
 --role="roles/iam.workloadIdentityUser" \
 --member="principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/subject/${SUBJECT}" >/dev/null
echo "PASS: OIDC -> Control Firebase service account; Preview only, no private keys"
echo "NIXINX_CONTROL_WIF_PROVIDER=//iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
echo "NIXINX_CONTROL_WIF_SERVICE_ACCOUNT=${SERVICE_ACCOUNT}"
