#!/usr/bin/env bash
# One-time Google Cloud setup for the Blender worker. Run in Cloud Shell (it uses your login there):
#   bash setup-gcp.sh
# Creates: an Artifact Registry repo, a runtime and a deploy service account, and keyless
# GitHub → Google auth (Workload Identity Federation) limited to the interior-studio repo.
# No keys are created or downloaded. Safe to re-run.
set -euo pipefail
PROJECT_ID=interior-studio-512608
REGION=asia-south1
GH_REPO=ajha23/interior-studio
DEPLOYER=deployer@${PROJECT_ID}.iam.gserviceaccount.com
WORKER=blender-worker@${PROJECT_ID}.iam.gserviceaccount.com

gcloud config set project "$PROJECT_ID" >/dev/null
echo "Enabling APIs (takes a minute the first time)…"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com

gcloud artifacts repositories describe studio --location "$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create studio --repository-format docker --location "$REGION" --description "Interior Studio images"

gcloud iam service-accounts describe "$WORKER" >/dev/null 2>&1 || \
  gcloud iam service-accounts create blender-worker --display-name "Blender worker (runtime, no roles)"
gcloud iam service-accounts describe "$DEPLOYER" >/dev/null 2>&1 || \
  gcloud iam service-accounts create deployer --display-name "GitHub Actions deployer"

for role in roles/run.admin roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$DEPLOYER" --role "$role" --condition None >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$WORKER" --member "serviceAccount:$DEPLOYER" --role roles/iam.serviceAccountUser >/dev/null

gcloud iam workload-identity-pools describe github --location global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create github --location global --display-name "GitHub Actions"
gcloud iam workload-identity-pools providers describe github --location global --workload-identity-pool github >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc github --location global --workload-identity-pool github \
    --display-name "GitHub" --issuer-uri https://token.actions.githubusercontent.com \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition "assertion.repository=='${GH_REPO}'"

NUM=$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${NUM}/locations/global/workloadIdentityPools/github/attribute.repository/${GH_REPO}" >/dev/null

echo
echo "Done. Send this line back to Claude:"
echo "PROJECT_NUMBER=${NUM}"
