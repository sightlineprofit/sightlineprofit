## Audit result — distributions are being dropped from the aligned rate

**Confirmed:** the $60k in "Additional distributions" is stored correctly but is silently excluded from the aligned rate whenever the firm's tax structure is anything other than S-Corp.

### Evidence

1. **Write path is fine.** Onboarding (`onboarding.tsx:237`) and Settings Simple mode (`settings.tsx:837-840`) write the value to `owner_compensation.distribution_annual`. Types + zod schema accept it. No data loss on save.

2. **UI total is fine.** The "Total compensation $141,680" pill in the Owner Compensation drawer (`settings.tsx:830`) adds `dist` whenever `!isAdv || isSCorp` — Simple mode always shows it.

3. **`calc()` gates it on structure.** In `src/lib/finance.ts:118-127` (owner-rows branch) and `:140-141` (fallback branch):
   ```
   if (structure === "s_corp") {
     distribution += Number(r.distribution_annual) || 0;
     …reserve…
   }
   ```
   For any firm whose `firm.structure` is not `s_corp` (LLC/sole-prop/partnership/other/null), `distribution_annual` is never added to `compTotal`, so it never reaches `totalCost` → `costFloor` → aligned rate.

4. **Matches the screenshots exactly.** Cost floor breakdown shows Owner compensation = **$81,680** = $60k draw + $9,180 payroll tax + $5k health + $7.5k retirement. The $60k distribution is missing. The drawer's "Total compensation" pill correctly shows **$141,680**. The two disagree by exactly the distribution amount, which is the bug's fingerprint.

5. **Impact on aligned rate.** With $60k of comp missing from the cost floor and the firm's billable-hours target unchanged, the aligned rate is understated by roughly `$60,000 / annual_billable_hours`. For the firm in the screenshot (~1,680 hrs/yr implied by $469,764 / $279), that's ~**$36/hr under-priced**.

### Proposed fix — write path only, one file

Edit `src/lib/finance.ts` so distributions always count toward `compTotal`, regardless of structure. Distributions are real cash the firm must fund; the S-Corp gate was a legacy assumption from when only Advanced/S-Corp exposed the field, but Simple mode (used by every non-S-Corp firm) has surfaced the input for a while and the UI already includes it in the displayed total.

Two small changes, both in `calc()`:

```text
owner-rows branch (~line 118):
-  if (structure === "s_corp") {
-    distribution += Number(r.distribution_annual) || 0;
-    …reserve months / reserve_target…
-  }
+  distribution += Number(r.distribution_annual) || 0;
+  if (structure === "s_corp") {
+    …reserve months / reserve_target…   // reserve stays S-Corp-only
+  }

fallback branch (~line 140):
-  distribution = structure === "s_corp" ? Number(config?.comp_distribution_annual) || 0 : 0;
+  distribution = Number(config?.comp_distribution_annual) || 0;
```

`reserveTarget` stays S-Corp-only (it's a structural planning target, not out-the-door comp). No changes to team-cost, opex, or hours math. No UI changes — the drawer already shows the correct total; only the cost-floor breakdown and aligned rate will change to match it.

### Verification checklist

- [ ] Firm in screenshot: cost floor Owner Compensation rises from $81,680 → $141,680; total cost floor rises by $60k; aligned rate rises accordingly.
- [ ] Cost floor breakdown gains a "Distributions $60,000" line under Owner compensation.
- [ ] S-Corp firms with distributions previously included: unchanged.
- [ ] Firms with `distribution_annual = 0` or null: unchanged.
- [ ] "Total compensation" pill in the drawer now matches Owner compensation total in the cost-floor popover.

### Not touched

- No changes to `calc()` beyond removing the two structure gates on distributions.
- No changes to onboarding, Settings UI, team cost, or dashboard components.
- No schema changes.