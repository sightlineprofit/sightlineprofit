## Fix — distributions dropped from aligned rate for non-S-Corp firms

**Root cause:** In `src/lib/finance.ts`, the `calc()` function only adds `distribution_annual` to owner compensation when `firm.structure === "s_corp"`. Lofty Design LLC (and any LLC/sole-prop/partnership) has its distributions silently excluded from `compTotal` → `totalCost` → cost floor → aligned rate, even though the Owner Compensation drawer's "Total compensation" pill correctly includes them. The two numbers disagree by exactly the distribution amount.

### Change — one file, two edits in `src/lib/finance.ts`

**Owner-rows branch (~line 118):** move the distribution addition out of the S-Corp gate; keep reserve target S-Corp-only.

```text
- if (structure === "s_corp") {
-   distribution += Number(r.distribution_annual) || 0;
-   …reserve months / reserve_target…
- }
+ distribution += Number(r.distribution_annual) || 0;
+ if (structure === "s_corp") {
+   …reserve months / reserve_target…
+ }
```

**Fallback branch (~line 140):** same — always count the config distribution.

```text
- distribution = structure === "s_corp" ? Number(config?.comp_distribution_annual) || 0 : 0;
+ distribution = Number(config?.comp_distribution_annual) || 0;
```

### Not touched
- No schema changes, no UI changes, no onboarding/settings write-path changes.
- `reserveTarget` stays S-Corp-only (structural planning target, not out-the-door comp).
- Team cost, opex, hours math unchanged.

### Verification
- Lofty Design LLC: cost-floor "Owner compensation" rises by the distribution amount; aligned rate rises by `distribution / annual_billable_hrs`; drawer "Total compensation" pill matches the cost-floor breakdown.
- S-Corp firms with distributions: unchanged.
- Firms with `distribution_annual = 0` or null: unchanged.
