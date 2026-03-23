-- Masterpiece Swarm Trader — Supabase Database Schema
-- Run this against your Supabase project: supabase db push
-- or paste into the Supabase SQL editor.

-- ── Extensions ────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Trading Logs ──────────────────────────────────────────────────
create table if not exists trading_logs (
  id            uuid primary key default uuid_generate_v4(),
  created_at    timestamptz not null default now(),
  asset         text not null,
  action        text not null check (action in ('BUY', 'SELL', 'HOLD')),
  price         numeric(18, 8) not null,
  volume        numeric(18, 8) not null default 0,
  notional_usd  numeric(18, 4) not null default 0,
  pnl_usd       numeric(18, 4) not null default 0,
  mode          text not null default 'paper' check (mode in ('paper', 'dry_run', 'live')),
  exchange      text not null default 'simulation',
  order_id      text,
  swarm_thought text,
  agent_votes   jsonb,
  metadata      jsonb
);

create index if not exists idx_trading_logs_created_at on trading_logs (created_at desc);
create index if not exists idx_trading_logs_asset      on trading_logs (asset);
create index if not exists idx_trading_logs_action     on trading_logs (action);

-- ── Swarm Council Decisions ───────────────────────────────────────
create table if not exists swarm_decisions (
  id            uuid primary key default uuid_generate_v4(),
  created_at    timestamptz not null default now(),
  asset         text not null,
  decision      text not null check (decision in ('BUY', 'SELL', 'HOLD')),
  confidence    numeric(5, 4) not null default 0 check (confidence between 0 and 1),
  agent_votes   jsonb not null default '{}',
  price_change  numeric(10, 6),
  is_bullish    boolean,
  rationale     text,
  executed      boolean not null default false,
  trade_log_id  uuid references trading_logs (id)
);

create index if not exists idx_swarm_decisions_created_at on swarm_decisions (created_at desc);
create index if not exists idx_swarm_decisions_asset      on swarm_decisions (asset);

-- ── Daily P&L Snapshots ───────────────────────────────────────────
create table if not exists daily_pnl (
  id            uuid primary key default uuid_generate_v4(),
  trade_date    date not null,
  total_pnl_usd numeric(18, 4) not null default 0,
  trade_count   integer not null default 0,
  win_count     integer not null default 0,
  loss_count    integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (trade_date)
);

-- ── Bot Configuration ─────────────────────────────────────────────
create table if not exists bot_config (
  id                    uuid primary key default uuid_generate_v4(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  trading_mode          text not null default 'paper' check (trading_mode in ('paper', 'dry_run', 'live')),
  is_active             boolean not null default false,
  max_notional_usd      numeric(10, 4) not null default 1.00,
  max_orders_per_day    integer not null default 20,
  kill_switch           boolean not null default false,
  target_assets         text[] not null default array['BTC-USD'],
  risk_tolerance        numeric(4, 3) not null default 0.02 check (risk_tolerance between 0 and 1)
);

-- Insert default config row
insert into bot_config (trading_mode, is_active, kill_switch)
values ('paper', false, false)
on conflict do nothing;

-- ── Row Level Security ────────────────────────────────────────────
alter table trading_logs    enable row level security;
alter table swarm_decisions enable row level security;
alter table daily_pnl       enable row level security;
alter table bot_config      enable row level security;

-- Service role has full access (used by the Python backend)
create policy "Service role full access on trading_logs"
  on trading_logs for all
  using (auth.role() = 'service_role');

create policy "Service role full access on swarm_decisions"
  on swarm_decisions for all
  using (auth.role() = 'service_role');

create policy "Service role full access on daily_pnl"
  on daily_pnl for all
  using (auth.role() = 'service_role');

create policy "Service role full access on bot_config"
  on bot_config for all
  using (auth.role() = 'service_role');
