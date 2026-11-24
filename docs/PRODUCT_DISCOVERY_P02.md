# P02 — Read-only product discovery candidate

FDV: https://github.com/NIXINX-Business-Transformation/nixinx-dwh/blob/main/docs/fdv/NIXINX_FDV_INDEX.md

POST /api/admin/provisioning/product/plan accepts appId, exact private NIXINX GitHub owner/repository and Vercel project ID. Superadmin only; fixed HTTPS API destinations; no redirect; timeout; manifest fetched at actual main SHA. Validate private, unarchived repository, exact team/project/Git binding and manifest module IDs and requirements. Older Corporate schemaVersion 1 without requirements is recognized as VERIFY, not ready. New Initiatives manifest candidate: https://github.com/NIXINX-Software/initiatives-portal/pull/4.

This is separate from the existing catalog PLAN. No catalog writes, app activation, tenant creation, credential generation, deploy or environment changes. The provider token environment names are candidate server configuration (NIXINX_PROVISIONING_GITHUB_READ_TOKEN, NIXINX_PROVISIONING_VERCEL_READ_TOKEN, NIXINX_PROVISIONING_VERCEL_TEAM_ID). No values created or configured; choose least-privilege approved provider credentials separately. No token from browser or public SDK. If credentials, Git link, team ownership, or manifest are absent/mismatched, fail closed. Direct live provider execution is not certified by unit tests. No application is declared technically or commercially ready.

Official REST contracts: https://docs.github.com/en/rest/repos/contents ; https://vercel.com/docs/rest-api . Release and domain verification, product registration transaction and generic runtime/data-plane authorization remain subsequent gates. Do not reuse Corporate-specific tokens, hardcoded hostnames or customer build settings.
