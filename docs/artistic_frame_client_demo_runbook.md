# Artistic Frame Client Demo Runbook (Issue #11)

**Deadline:** Monday, 21 Sep 2026 (Europe/Istanbul)  
**Upstream cohort:** `Adversoup/RueIV-Source#143`  
**Target gate (live):** `ARTISTIC_FRAME_CLIENT_DEMO_LIVE_BOUNDED_SHOWCASE_VERIFIED_READY_FOR_MONDAY`

Bounded RueIV Shopify showcase: Artistic Frame only, ≤50 products, dedicated hidden-from-nav collection, price hidden, rollback manifest, **no theme publish**, **no menu changes**.

---

## Phase 0 — Rehearsal foundation (PR #10)

Confirm PR #10 / Issue #9 rehearsal pack is green on current branch:

```bash
npm run staging:simulate          # synthetic 10/10
npm run staging:rehearsal         # real Hub CSV 84/84
npm run theme-check
```

---

## Phase 1 — Consume Source#143 cohort

When RueIV-Source#143 exports `manifest.json` + `products.json`:

```bash
node scripts/ingest_source143_af_cohort.js --from /path/to/source143/export
```

Validates: Artistic Frame vendor only, ≤50 records, checksum/fingerprint.

**Until Source#143 lands:** machinery dry-run only with scaffold (3 records):

```bash
npm run af-demo:preflight:scaffold
```

Scaffold is **not authorized for live Shopify mutation**.

---

## Phase 2 — Preflight + rollback manifest (required before any live write)

```bash
npm run af-demo:preflight
```

Produces:

| Output | Purpose |
|--------|---------|
| `out/artistic_frame_demo_preflight_report.json` | Cohort count, mapping, intended create/update/no-op |
| `out/artistic_frame_demo_rollback_manifest.json` | Prior state + one-command rollback |

Preflight records:

- exact cohort count ≤50
- Source#143 fingerprint (when ingested)
- SKU/vendor duplicate lookup (when Shopify credentials present)
- collection `artistic-frame-demo` current state
- quarantined/ambiguous identities (must be zero for live)

**Gate:** `ARTISTIC_FRAME_CLIENT_DEMO_PREFLIGHT_READY`

---

## Phase 3 — Bounded live sync (owner-authorized only)

```bash
npm run af-demo:sync          # dry-run (default)
npm run af-demo:sync:live     # live mutation
```

Live sync requires:

1. Preflight gate pass (Source#143 ingested, not scaffold)
2. `SHOPIFY_STORE` + `SHOPIFY_ADMIN_ACCESS_TOKEN`
3. Zero quarantined records

Creates/updates **only** the AF demo cohort and manual collection `artistic-frame-demo`. Does **not** modify navigation or publish theme.

---

## Phase 4 — Client demo URLs

After live sync (replace store domain):

| View | URL |
|------|-----|
| Demo collection | `https://{store}/collections/artistic-frame-demo` |
| Strong PDP example | First cohort SKU handle from sync report |
| Vendor fallback | `https://{store}/collections/artistic-frame` or `?filter.p.vendor=Artistic+Frame` |

### Show flow (4 stops)

1. **Consortium Hub** — Artistic Frame vendor/product view (Source#143 cohort)
2. **Shopify collection** — `/collections/artistic-frame-demo`
3. **Strong PDP** — multi-image or flagship SKU from sync report
4. **Edge-case PDP** — variant or no-tearsheet SKU if present in cohort

---

## Phase 5 — Verification checklist

- [ ] All cohort products resolve to PDPs
- [ ] Collection renders; not in main navigation
- [ ] Price hidden on cards + PDP + JSON-LD
- [ ] Vendor = `Artistic Frame`
- [ ] Images/gallery from Hub refs only
- [ ] Tearsheet link when `specs.tearsheet` present
- [ ] Responsive product-card smoke
- [ ] Existing storefront unaffected outside cohort

---

## Rollback

```bash
npm run af-demo:rollback        # dry-run
npm run af-demo:rollback:live   # execute
```

- Demo-**created** products → `DRAFT`
- Demo-**updated** products → prior state from manifest
- Demo-**created** collection → deleted (if created by sync)
- No deletes outside demo scope

---

## Hard boundaries

| Allowed | Blocked |
|---------|---------|
| ≤50 Artistic Frame products | Other vendors |
| `artistic-frame-demo` collection | Theme publish |
| Price hidden via mapper | Menu/navigation changes |
| Hub image URL refs | Production media processing |
| Rollback manifest | Hub catalog mutation |
| DRAFT/ACTIVE on cohort only | Broad live sync |

---

## Quick reference

```bash
# Full dry-run pipeline (scaffold until Source#143)
npm run staging:rehearsal
npm run af-demo:preflight:scaffold
npm run af-demo:sync
npm run af-demo:rollback

# Production path (after Source#143 ingest)
node scripts/ingest_source143_af_cohort.js --from /path/to/export
npm run af-demo:preflight
npm run af-demo:sync:live
# verify → demo
# if needed:
npm run af-demo:rollback:live
```
