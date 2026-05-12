# LeetPlus Project State

Last updated: 2026-05-07

## Current Workflow

- Main local repo: `C:\Users\ALIENWARE\Desktop\leetplus`
- Production site: `https://leetplus.ru`
- API: `https://api.leetplus.ru`
- GitHub repo: `https://github.com/boozik3412/leetplus`
- Production branch: `main`
- VDS auto-deploy watches `origin/main`; preferred workflow is code change, verify build if needed, commit, push.
- Do not spend time refreshing local DB state or restarting local services unless explicitly requested. User reviews changes directly on `leetplus.ru`.

## Stack

- Monorepo with `pnpm workspaces`
- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- Backend: NestJS 11, TypeScript
- Database: PostgreSQL, Prisma
- Production VDS: Ubuntu 24.04 LTS on reg.ru, IP `168.222.143.243`
- Production mail: `reports@leetplus.ru` through Mail.ru/VK WorkSpace SMTP

## Product Context

LeetPlus is an assortment analytics SaaS for computer clubs and club networks. It imports LAngame data, normalizes goods across clubs into network SKU groups, and provides analytics for sales, stock, OOS risk, margin, recommendations, LFL, new products, and assortment quality.

Connected production LAngame sources:

- `1337.langame.ru`
- `443.langame.ru`
- `46.langamepro.ru`

## Important Data Rules

- Sales history must remain stable when product names change.
- Sales facts keep snapshot fields such as product/store names at the moment of sale.
- Deleted or missing LAngame nomenclature must not delete historical sales.
- LAngame sync must not automatically set `canonicalProductId`.
- Product grouping into a canonical/network SKU happens only through analysis/manual confirmation.
- A rejected parsing suggestion should not delete existing product links.
- Already confirmed parsing groups should not be suggested again unless there is a real change/new item to review.
- Manual store names in LeetPlus should be preserved; sync may update address/activity/source linkage, but not overwrite user-facing names.

## Key Metrics

- Active SKU: SKU with current stock or sales in the last 14 days.
- New products: products whose first historical positive stock appeared in the last 90 days.
- OOS risk: stock expected to last 3 days or less based on average daily sales.
- No-sales report: should exclude items with zero stock and items that had arrivals during the viewed report period.
- Cost per unit: calculated from stock cost basis and used for profit, margin, markup, ABC, and reports.
- Dashboard custom period charts: should compare 8 analogous periods; the selected custom period is the latest segment.

## Current Feature Areas

- Dashboard: compact filters, responsive header, KPI cards, trend charts, category weights/efficiency, active assortment, TOP SKU.
- Reports: collapsible report list, row-level sales detail report, summary export/email, LFL, new products, recommendations, OOS, no-sales, replenishment, ABC, top SKU/suppliers, assortment.
- Product parsing utilities: automatic analysis, safe confirmation/rejection, existing canonical SKU awareness, manual parsing page.
- Products/stores/directories: inline editing, multi-club filters, exports, manual store name preservation.
- Mail: Mail.ru/VK WorkSpace domain is configured; SMTP uses `reports@leetplus.ru`.

## Recent Work

- Fixed dashboard trend card sizing behavior.
- Preserved manual store names during sync.
- Filtered no-sales report by stock and arrivals.
- Localized summary report export labels to Russian.
- Combined summary export and email controls.
- Clarified report export/email UI and error messages.
- Refined report disclosure controls.
- Added "Общий отчет по продажам" to reports and summary export/email for Excel pivot-table source rows.
- Reworked the management dashboard around commercial control: first-screen KPI composition, "what changed", "main focus", and "what to do today" blocks.
- Added full/current period selectors, European date formatting, dashboard report anchors, and responsive fixes from live review.
- Added product movement analytics: compact product-page preview, full table, 7/14/21 day periods, stock column, sorting/filtering, exports, and email.
- Started Stage 2 commercial reports with OOS revenue/profit-at-risk estimates in tables and exports, including profit at risk for the selected period.
- Added hybrid "Money at risk" reporting: OOS profit-at-risk plus frozen stock in no-sales products, surfaced on the dashboard and reports.

## Near-Term Backlog

### Stage 1. Management Dashboard

Status: mostly implemented; continue polishing UX from live production review.

- Keep the first screen focused on commercial control: revenue, gross profit, margin, sold units, OOS risk, and stock.
- Refine period-to-period comparison copy and responsive layout after live checks.
- Continue tightening direct action links from dashboard cards to the relevant reports.

### Stage 2. Commercial Reports

Status: active stage.

- Add lost sales / revenue-at-risk from OOS with estimated missed revenue and gross profit. Initial implementation uses "profit at risk for period"; stricter historical lost-profit calculation should later use daily stock history.
- Add a hybrid assortment-loss view that combines OOS profit risk with frozen stock in no-sales SKU.
- Add plan/fact by network, club, category, and supplier.
- Add turnover, frozen money in stock, and slow SKU control.
- Add supplier scorecard with sales, profit, write-offs, OOS, delivery quality, and problem categories.

### Stage 3. Assortment Matrix

- Add mandatory SKU and assortment role concepts.
- Build a product x club matrix: sold, in stock, no stock, no sales, missing, needs replenishment.
- Add an assortment quality index by club, category, and network.

### Stage 4. Recommendations Workflow

- Show financial effect for recommendations: expected revenue, profit, loss reduction, or stock release.
- Split recommendations by role: commercial director, buyer, club manager.
- Add recommendation statuses: new, in progress, done, rejected, hidden, reappeared.

### Stage 5. Regular Digests

- Daily email digest for network-level money, margin, OOS, write-offs, no-sales SKU, and required actions.
- Weekly commercial report for owner/director with dynamics and problem zones.
- Later add Telegram/WhatsApp alerts for critical events.

### Stage 6. Product Commercialization

- Demo mode with prepared data and clear value story without LAngame setup.
- Commercial network audit page: losses, growth opportunities, matrix quality, and expected effect.
- Tariff levels: basic analytics, advanced reports, recommendations, regular digests, and assortment audit.

### Continuous Polish

- Continue polishing report table UX, filters, exports, and mobile layout based on live `leetplus.ru` review.
- Keep README and this file aligned when workflow, data rules, or production setup changes.

## Useful Commands

```powershell
git -C 'C:\Users\ALIENWARE\Desktop\leetplus' status --short
node 'C:\Users\ALIENWARE\Desktop\leetplus\.codex-tools\node_modules\pnpm\bin\pnpm.cjs' -r build
git -C 'C:\Users\ALIENWARE\Desktop\leetplus' log --oneline -8
```
