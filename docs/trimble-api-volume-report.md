# Haul Monitor — Trimble PC*MILER Pricing Analysis
**Prepared for:** Trimble Partnership Meeting
**Date:** March 19, 2026
**Prepared by:** Haul Monitor

---

## 1. Trimble Proposed Pricing (As Submitted)

| Term | Detail |
|---|---|
| Per-load rate | $0.30 per posted load / per month |
| Monthly minimum (months 1–6) | $250/month |
| Monthly minimum (month 7+ / renewals) | $500/month |
| Reporting obligation | Load count submitted by the 10th of each month |
| Billing | Credit card for first 6 months; optional Net-30 thereafter |

---

## 2. Why "Posted Load" Doesn't Fit Haul Monitor's Model

Haul Monitor is **not a load board**. We do not originate or post freight.

Our model: dispatchers connect their existing load board accounts (DAT, Truckstop, etc.) and Haul Monitor aggregates available loads from those boards, runs them through PC*MILER's routing engine, and surfaces the best backhaul matches for their route home. The loads already exist elsewhere — we are the intelligence layer on top of them.

This means:
- We have no "posted loads" to count
- Charging us per load in our system would mean paying for inventory we don't own
- At scale, a single popular backhaul lane could have the same load evaluated by hundreds of our users — it should not count as hundreds of billable events

**The right pricing unit for an aggregator is the downstream action: a dispatcher selecting a load to haul.**

---

## 3. Proposed Counter-Model: Per Load Selected

### The "Haul This Load" Event

Haul Monitor has a built-in confirmation workflow called **"Haul This Load."** When a dispatcher finds a match they want to pursue, they click the button, review the route/financials in a confirmation dialog, and confirm. That event:

- Writes a timestamped record to our database (`completed_at`, `status: completed`, `revenue_amount`, `net_revenue`)
- Is discrete, auditable, and non-gameable — a dispatcher only clicks it when they are genuinely taking the load
- Is exactly the moment PC*MILER's routing intelligence delivered value

This is the event we propose as the billable unit.

### Why This Works for Both Parties

| | Per Posted Load (Trimble's Proposal) | Per Load Selected (Haul Monitor Counter) |
|---|---|---|
| Fits Haul Monitor's model | No — we don't post loads | Yes — we track selections natively |
| Auditable | Requires defining what "in system" means | Yes — timestamped DB record per event |
| Tied to PC*MILER value delivery | Loosely | Directly — selection follows a PC*MILER match |
| Fair at scale | No — same load seen by 1,000 users = 1,000 charges | Yes — one charge per dispatcher action |
| Predictable for Trimble | Variable | Consistent with platform growth |

---

## 4. Market Basis (TAM)

| Segment | Count | Source |
|---|---|---|
| Specialized truck dispatchers (core) | 38,000–40,000 | Bureau of Labor Statistics |
| Dedicated truck dispatchers (expanded) | ~196,000 | Industry estimates |
| Broader transport/logistics/dispatch roles | 200,000+ | BLS (related fields) |

**Working TAM:** 39,000 (core/conservative) and 196,000 (expanded)

---

## 5. Usage Model — Searches vs. Selections

The key distinction in Haul Monitor's workflow is the large gap between loads *evaluated* and loads *selected*.

| Parameter | Assumption | Rationale |
|---|---|---|
| Searches per dispatcher per day | 10 | Active dispatchers managing multiple trucks |
| Loads evaluated per search | 25 | Current match cap |
| Total loads seen per day | 250 | Before filtering and selection |
| Loads actually hauled per day | 2–5 | Realistic for a dispatcher managing a small fleet |
| **Conversion rate (seen → hauled)** | **~1–2%** | Dispatcher evaluates many options, commits to few |
| **Hauls per user per month** | **~50–110** | 22 working days |

**Working baseline for cost modeling:** 50 "Haul This Load" events per active user per month (conservative).

---

## 6. Cost Projections — Per Load Selected at $0.30

| Platform Scale | Active Users | Hauls/User/Mo | Monthly Hauls | Monthly Cost | Annual Cost |
|---|---|---|---|---|---|
| Early (pre-launch) | <10 | 50 | <500 | **$250** (minimum) | $3,000 |
| Seed growth | ~50 | 50 | 2,500 | **$750** | $9,000 |
| 1% core TAM | ~390 | 50 | 19,500 | **$5,850** | $70,200 |
| 5% core TAM | ~1,950 | 50 | 97,500 | **$29,250** | $351,000 |
| 10% core TAM | ~3,900 | 50 | 195,000 | **$58,500** | $702,000 |
| 5% expanded TAM | ~9,800 | 50 | 490,000 | **$147,000** | $1.76M |

---

## 7. Haul Monitor Pricing Model — Credits, Not Subscriptions

Haul Monitor uses a **pay-per-search credit model**. No monthly subscription. Credits never expire.

| Bundle | Price | Credits | Cost Per Credit | Savings vs. Starter |
|---|---|---|---|---|
| Starter | $50 | 10 | **$5.00/credit** | — |
| Pro *(most popular)* | $75 | 30 | **$2.50/credit** | 50% |
| Fleet | $200 | 100 | **$2.00/credit** | 60% |

**What costs 1 credit:**
- Creating and running a backhaul search
- Material change re-run on an open, active backhaul request
- Creating and running an estimate request

### Credit Consumption Per Active User Per Month

| Usage Level | Searches/Day | Credits/Month | Likely Bundle |
|---|---|---|---|
| Light | 1 | ~22 | Starter (×2) or Pro |
| Moderate | 2–3 | ~50–65 | Pro (×2) or Fleet |
| Heavy | 5 | ~110 | Fleet + top-up |

*Baseline for modeling: 50 credits/user/month (moderate user, roughly one Pro bundle per month).*

---

## 8. Revenue Margin Implications — Credits vs. Trimble Cost

### Revenue Per Credit (by bundle)

| Bundle | Revenue/Credit | Trimble Cost/Credit* | Gross Margin |
|---|---|---|---|
| Starter | $5.00 | $0.03–$0.30 | **94–99%** |
| Pro | $2.50 | $0.03–$0.30 | **88–99%** |
| Fleet | $2.00 | $0.03–$0.30 | **85–99%** |

*Trimble cost per credit = $0.30 per haul selected ÷ estimated 1–10 searches per haul conversion rate.*

**Conversion rate drives Trimble cost:** a dispatcher runs multiple searches before committing to a load. At 10% conversion (1 haul per 10 searches), Trimble costs $0.03/credit. At 100% (every search results in a haul), it's $0.30/credit — still only 6–15% of revenue.

### Monthly Revenue at Scale (50 credits/user/month, Pro-tier blended at $2.50/credit)

| Scenario | Users | Credits/Month | Monthly Revenue | Trimble Cost | Gross Margin |
|---|---|---|---|---|---|
| 1% core TAM | 390 | 19,500 | $48,750 | $5,850 | **$42,900 (88%)** |
| 5% core TAM | 1,950 | 97,500 | $243,750 | $29,250 | **$214,500 (88%)** |
| 10% core TAM | 3,900 | 195,000 | $487,500 | $58,500 | **$429,000 (88%)** |
| 5% expanded TAM | 9,800 | 490,000 | $1,225,000 | $147,000 | **$1,078,000 (88%)** |

> Margins hold consistently at ~88% across all scale scenarios at the Pro tier. The credit model is well-structured: Trimble's cost scales with usage, and our revenue scales with the same usage. There is no margin compression at growth.

---

## 9. Comparison: Per Load Selected vs. Per Load Evaluated (API Call Equivalent)

To illustrate why the per-selection model is fair and sustainable — and why a per-call or per-evaluation model would be punishing for an aggregator:

### Per-User Monthly API Activity
| Parameter | Value |
|---|---|
| Fresh (uncached) searches/day | 4 (of 10 total; 60% cache hit rate) |
| Loads evaluated per fresh search | 25 |
| Route Report calls per evaluation | 2 (datum→pickup + delivery→home) |
| **Route Report calls/user/day** | **200** |
| **Route Report calls/user/month** | **~4,400** |

### Monthly API Call Volume vs. Monthly Selections

| Scenario | Users | API Calls/Month | Load Selections/Month | Ratio |
|---|---|---|---|---|
| 1% core TAM | 390 | 1.7M | 19,500 | 87:1 |
| 5% core TAM | 1,950 | 8.6M | 97,500 | 88:1 |
| 10% core TAM | 3,900 | 17.2M | 195,000 | 88:1 |
| 5% expanded TAM | 9,800 | 43M | 490,000 | 88:1 |

**For every load a dispatcher hauls, Haul Monitor makes ~88 PC*MILER API calls.** The per-selection model prices the outcome; the per-call model prices the work. Trimble should prefer the outcome model — it scales with our success and is immune to caching optimizations on our end.

---

## 10. Key Questions / Negotiating Points for the Meeting

1. **Challenge the "posted load" framing** — We are an aggregator, not a load board. Propose "per load selected" as the billing unit and explain the "Haul This Load" tracking mechanism.
2. **Get the tier breakpoints** — Trimble mentioned discounted tiers. At what monthly selection volume do rates drop, and to what? This shapes our growth economics.
3. **Confirm what's auditable** — We can export monthly haul counts from our database by the 10th of each month. Does Trimble want raw counts, or load IDs/timestamps? We can provide either.
4. **API rate limits** — We generate bursts of up to 50 parallelized calls per dispatcher search. Confirm no burst throttling that would degrade the UX.
5. **Relay loads** — Our relay mode evaluates a different route geometry. Do relay hauls count the same as standard hauls?
6. **Lock in the rate** — Whatever rate is agreed, negotiate the right to drop to a lower tier as volume grows without renegotiating the full agreement.
7. **Multi-board users** — If a dispatcher connects DAT and Truckstop, and the same load appears on both, a single "Haul This Load" event fires once. Confirm this counts as one billable event, not two.

---

## 11. Summary

| | |
|---|---|
| Trimble's proposed unit | Per posted load/month |
| **Haul Monitor's proposed unit** | **Per load selected ("Haul This Load" event)** |
| Why the change | Haul Monitor is an aggregator — we don't post loads |
| Tracking mechanism | Built — timestamped DB record on dispatcher confirmation |
| Haul Monitor pricing | Credit bundles: $50/10 credits · $75/30 credits · $200/100 credits |
| Revenue per credit (Pro) | $2.50 |
| Minimum cost | $250/mo (yr 1), $500/mo (yr 2+) |
| Trimble cost per credit | $0.03–$0.30 (varies by search-to-haul conversion rate) |
| Gross margin after Trimble | ~88% at Pro tier, across all scale scenarios |
| API calls per haul selected | ~88 (demonstrates value of outcome-based pricing) |
| Verdict | Credit model + per-selection Trimble pricing = consistent ~88% margins at every scale |

---

*Assumptions: 22 working days/month, 10 searches/dispatcher/day, 40% cache miss rate, 25 load candidates/search, 2 Route Report calls/load, 50 "Haul This Load" events/user/month.*
