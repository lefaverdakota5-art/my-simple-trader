# Copilot handoff: next implementation steps for my-simple-trader

This repository already has the following merged into `main`:
- authenticated `api-bot-config` edge function
- authenticated `api-intents` edge function
- `execute-approved-intents` server-side processor
- `useBotConfigEdge.ts`
- `useTradeIntentsEdge.ts`
- `IntentsEdge.tsx`

This branch also adds:
- `src/pages/Funding.tsx`

## Highest priority changes

1. Switch the active intents route to the edge-based page.
2. Add the Funding route to the main router.
3. Replace the remaining direct REST vote/cancel calls in `IntentsEdge.tsx` with one authenticated edge endpoint.
4. Keep dry-run behavior on by default.
5. Do not expose service-role keys client-side.

## Exact router change required

Update `src/App.tsx` so that:
- `import Intents from "./pages/Intents";` becomes `import IntentsEdge from "./pages/IntentsEdge";`
- add `import Funding from "./pages/Funding";`
- route `/intents` uses `<IntentsEdge />`
- add route `/funding` using `<Funding />`

## Required edge function to add

Create `supabase/functions/api-intent-actions/index.ts` with authenticated handling for:
- `approve`
- `deny`
- `cancel`

Input shape:
```json
{
  "intent_id": "uuid",
  "action": "approve|deny|cancel",
  "confidence": 1,
  "rationale": "optional text"
}
```

Rules:
- authenticate with existing shared auth helper
- only allow the owner user for the intent
- for approve/deny: upsert into `trading.trade_intent_votes`
- for cancel: update `trading.trade_intents.status` to `cancelled` only from `pending` or `approved`
- return the refreshed intent row

## Required frontend follow-up

Update `src/pages/IntentsEdge.tsx`:
- remove direct REST calls to `/rest/v1/trade_intent_votes`
- remove direct REST patch call to `/rest/v1/trade_intents`
- replace both with authenticated fetch calls to `/functions/v1/api-intent-actions`

## Funding page expectations

`src/pages/Funding.tsx` is a UI-level funding control surface.
Keep it as a funding management page unless and until a real payments provider is introduced.
Do not fake real Apple Pay / Google Wallet processing.

## Safety and architecture

- keep `dry_run` enabled by default
- keep exchange keys server-side only
- do not add unauthenticated function execution
- do not bypass JWT verification
- do not introduce client-side secrets
