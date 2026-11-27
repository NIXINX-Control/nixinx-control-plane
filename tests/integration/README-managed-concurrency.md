# Managed Firestore concurrency acceptance (operator only)

Control #76 passed the four emulator scenarios. This test reuses exactly those scenarios, real Admin SDK and mocked financial responses, with additional explicit managed-mode guard and safe cleanup. It is not a Stripe E2E test.

Prerequisites: CI and Codex review on the final commit, operator authorization recorded in FDV, existing authorized Google ADC for nixinx-control, no emulator, no new IAM, no Stripe credentials. Run only from a reviewed, pinned checkout. Never run in a production server or CI.

```bash
unset FIRESTORE_EMULATOR_HOST
export GOOGLE_CLOUD_PROJECT=nixinx-control
NIXINX_MANAGED_CONCURRENCY=AUTHORIZE_SYNTHETIC_WRITES node --test tests/integration/native-credit-firestore.test.mjs
```

The script prints exact synthetic paths before writing and checks every path absent. It uses only audit and commercialRefundLocks. Every generated payment uses pi_nxfixture_ and a run-specific random suffix. Audit actor is unique per run. Cleanup transaction verifies ownership and fingerprint of every existing fixture before deleting any of them, then reads every path again. It will refuse cleanup on conflict or an unfinished test. Retain output; a crash or interruption can leave synthetic records, so stop and inspect those exact paths before retrying. Never delete by collection or prefix. No real customer, order, payment, Stripe call, or financial mutation is involved.

Expected: four tests PASS, zero failures, both preflight and cleanup PASS markers. No claim of Stripe E2E or activation authorization.
