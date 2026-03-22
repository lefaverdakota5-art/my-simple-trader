# Funding and withdrawal architecture

This app can support a complete money movement experience only with an official payments and brokerage stack.

## What is already safe to build in-app

- funding UI flows
- withdrawal request UI flows
- ledger and status tracking
- dry-run portfolio accounting
- intent creation and approval
- server-side execution orchestration with authenticated edge functions

## What cannot be made real without external providers

- debit/ACH deposits from any bank
- Apple Pay real payment processing
- Google Wallet real payment processing
- stock liquidation to cash
- crypto liquidation to USD and bank payout
- real custody, settlement, transfers, or withdrawals

## Recommended adapter layers

### 1. Funding provider adapter
Responsible for:
- creating payment intents
- ACH/bank debit setup
- Apple Pay and Google Pay token handling
- deposit status webhooks

Suggested interface:

```ts
export interface FundingProvider {
  createDepositIntent(input: {
    userId: string;
    amountUsd: number;
    method: "bank" | "apple_pay" | "google_wallet";
  }): Promise<{
    providerIntentId: string;
    clientToken?: string;
    status: "requires_action" | "processing" | "succeeded";
  }>;

  createWithdrawal(input: {
    userId: string;
    amountUsd: number;
    destinationId: string;
  }): Promise<{
    providerPayoutId: string;
    status: "processing" | "paid" | "failed";
  }>;
}
```

### 2. Brokerage / exchange execution adapter
Responsible for:
- balances
- order placement
- order status
- fills
- cash balances
- asset liquidation before withdrawal

Suggested interface:

```ts
export interface ExecutionProvider {
  getBalances(userId: string): Promise<{
    cashUsd: number;
    holdings: Record<string, number>;
  }>;

  liquidateToUsd(input: {
    userId: string;
    symbol: string;
    quantity?: number;
    notionalUsd?: number;
  }): Promise<{
    orderId: string;
    status: "open" | "filled" | "rejected";
    proceedsUsd?: number;
  }>;
}
```

## Required tables to add before real funding

### `public.funding_requests`
- id
- user_id
- method
- amount_usd
- provider
- provider_intent_id
- status
- metadata
- created_at
- updated_at

### `public.withdrawal_destinations`
- id
- user_id
- destination_type
- provider
- provider_destination_id
- label
- last4
- is_default
- created_at
- updated_at

### `public.withdrawal_runs`
- id
- user_id
- requested_amount_usd
- liquidated_amount_usd
- payout_amount_usd
- provider_payout_id
- status
- metadata
- created_at
- updated_at

## Required edge functions before real funding

### `api-funding-intents`
Authenticated function for creating deposit intents.

### `api-withdrawals`
Authenticated function for creating payout requests.

### `api-liquidate-to-usd`
Authenticated function for selling supported assets into USD before withdrawal.

### `provider-webhooks`
Server-only webhook endpoint for payment/brokerage status callbacks.

## Current project recommendation

Until a real provider is chosen, keep the app in this state:
- funding UI active
- funding requests stored as simulated or pending
- dry-run trading active by default
- no real withdrawal execution
- no fake payment claims in UI

## Safe next implementation order

1. Route `/intents` to `IntentsEdge`
2. Add `/funding` route
3. Add `funding_requests` and `withdrawal_destinations` tables
4. Add authenticated `api-funding-requests` simulation endpoint
5. Add authenticated `api-withdrawal-requests` simulation endpoint
6. When a real provider is chosen, implement the provider adapter server-side only
