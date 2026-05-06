# LeetPlus Project State

Last updated: 2026-05-06

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

## Near-Term Backlog

- Continue polishing report table UX, filters, exports, and mobile layout based on live `leetplus.ru` review.
- Keep README and this file aligned when workflow, data rules, or production setup changes.

## Useful Commands

```powershell
git -C 'C:\Users\ALIENWARE\Desktop\leetplus' status --short
node 'C:\Users\ALIENWARE\Desktop\leetplus\.codex-tools\node_modules\pnpm\bin\pnpm.cjs' -r build
git -C 'C:\Users\ALIENWARE\Desktop\leetplus' log --oneline -8
```
