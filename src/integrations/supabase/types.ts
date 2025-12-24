export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      balances_snapshot: {
        Row: {
          available_usd: number | null
          created_at: string | null
          holdings: Json | null
          id: string
          open_orders_count: number | null
          reserved_usd: number | null
          snapshot_at: string | null
          total_usd: number | null
          user_id: string
        }
        Insert: {
          available_usd?: number | null
          created_at?: string | null
          holdings?: Json | null
          id?: string
          open_orders_count?: number | null
          reserved_usd?: number | null
          snapshot_at?: string | null
          total_usd?: number | null
          user_id: string
        }
        Update: {
          available_usd?: number | null
          created_at?: string | null
          holdings?: Json | null
          id?: string
          open_orders_count?: number | null
          reserved_usd?: number | null
          snapshot_at?: string | null
          total_usd?: number | null
          user_id?: string
        }
        Relationships: []
      }
      bot_config: {
        Row: {
          cooldown_seconds: number | null
          created_at: string | null
          id: string
          keep_usd_reserve: number | null
          kill_switch: boolean | null
          max_daily_loss_pct: number | null
          max_exposure_per_asset_pct: number | null
          max_orders_per_tick: number | null
          mode: string | null
          pairs: string[] | null
          sell_target_usd: number | null
          stop_loss_pct: number | null
          take_profit_pct: number | null
          trade_size_pct: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cooldown_seconds?: number | null
          created_at?: string | null
          id?: string
          keep_usd_reserve?: number | null
          kill_switch?: boolean | null
          max_daily_loss_pct?: number | null
          max_exposure_per_asset_pct?: number | null
          max_orders_per_tick?: number | null
          mode?: string | null
          pairs?: string[] | null
          sell_target_usd?: number | null
          stop_loss_pct?: number | null
          take_profit_pct?: number | null
          trade_size_pct?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cooldown_seconds?: number | null
          created_at?: string | null
          id?: string
          keep_usd_reserve?: number | null
          kill_switch?: boolean | null
          max_daily_loss_pct?: number | null
          max_exposure_per_asset_pct?: number | null
          max_orders_per_tick?: number | null
          mode?: string | null
          pairs?: string[] | null
          sell_target_usd?: number | null
          stop_loss_pct?: number | null
          take_profit_pct?: number | null
          trade_size_pct?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cashout_plans: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          keep_for_bots_usd: number | null
          pull_amount_usd: number
          status: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          keep_for_bots_usd?: number | null
          pull_amount_usd: number
          status?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          keep_for_bots_usd?: number | null
          pull_amount_usd?: number
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      fee_cache: {
        Row: {
          id: string
          maker_fee: number | null
          taker_fee: number | null
          updated_at: string | null
          user_id: string
          volume_30d: number | null
        }
        Insert: {
          id?: string
          maker_fee?: number | null
          taker_fee?: number | null
          updated_at?: string | null
          user_id: string
          volume_30d?: number | null
        }
        Update: {
          id?: string
          maker_fee?: number | null
          taker_fee?: number | null
          updated_at?: string | null
          user_id?: string
          volume_30d?: number | null
        }
        Relationships: []
      }
      pair_rules: {
        Row: {
          base_asset: string
          costmin: number | null
          id: string
          kraken_pair: string
          lot_decimals: number | null
          ordermin: number | null
          pair: string
          pair_decimals: number | null
          quote_asset: string | null
          status: string | null
          tick_size: number | null
          updated_at: string | null
        }
        Insert: {
          base_asset: string
          costmin?: number | null
          id?: string
          kraken_pair: string
          lot_decimals?: number | null
          ordermin?: number | null
          pair: string
          pair_decimals?: number | null
          quote_asset?: string | null
          status?: string | null
          tick_size?: number | null
          updated_at?: string | null
        }
        Update: {
          base_asset?: string
          costmin?: number | null
          id?: string
          kraken_pair?: string
          lot_decimals?: number | null
          ordermin?: number | null
          pair?: string
          pair_decimals?: number | null
          quote_asset?: string | null
          status?: string | null
          tick_size?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      plaid_accounts: {
        Row: {
          account_id: string
          created_at: string
          id: string
          is_primary: boolean | null
          item_id: string
          mask: string | null
          name: string | null
          subtype: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
          item_id: string
          mask?: string | null
          name?: string | null
          subtype?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
          item_id?: string
          mask?: string | null
          name?: string | null
          subtype?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      plaid_items: {
        Row: {
          access_token: string
          created_at: string
          id: string
          institution_name: string | null
          item_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          institution_name?: string | null
          item_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          institution_name?: string | null
          item_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          closed_at: string | null
          created_at: string
          current_price: number | null
          entry_price: number
          entry_txid: string | null
          exit_price: number | null
          exit_txid: string | null
          high_water_mark: number | null
          id: string
          pair: string
          quantity: number
          realized_pnl: number | null
          side: string
          status: string
          stop_loss_percent: number | null
          symbol: string
          take_profit_percent: number | null
          trailing_stop_enabled: boolean | null
          trailing_stop_price: number | null
          unrealized_pnl: number | null
          unrealized_pnl_percent: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          current_price?: number | null
          entry_price: number
          entry_txid?: string | null
          exit_price?: number | null
          exit_txid?: string | null
          high_water_mark?: number | null
          id?: string
          pair: string
          quantity: number
          realized_pnl?: number | null
          side?: string
          status?: string
          stop_loss_percent?: number | null
          symbol: string
          take_profit_percent?: number | null
          trailing_stop_enabled?: boolean | null
          trailing_stop_price?: number | null
          unrealized_pnl?: number | null
          unrealized_pnl_percent?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          current_price?: number | null
          entry_price?: number
          entry_txid?: string | null
          exit_price?: number | null
          exit_txid?: string | null
          high_water_mark?: number | null
          id?: string
          pair?: string
          quantity?: number
          realized_pnl?: number | null
          side?: string
          status?: string
          stop_loss_percent?: number | null
          symbol?: string
          take_profit_percent?: number | null
          trailing_stop_enabled?: boolean | null
          trailing_stop_price?: number | null
          unrealized_pnl?: number | null
          unrealized_pnl_percent?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_health: {
        Row: {
          executor_online: boolean | null
          id: string
          kraken_error_count_15m: number | null
          last_balance_sync_at: string | null
          last_error: string | null
          last_exec_at: string | null
          last_tick_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          executor_online?: boolean | null
          id?: string
          kraken_error_count_15m?: number | null
          last_balance_sync_at?: string | null
          last_error?: string | null
          last_exec_at?: string | null
          last_tick_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          executor_online?: boolean | null
          id?: string
          kraken_error_count_15m?: number | null
          last_balance_sync_at?: string | null
          last_error?: string | null
          last_exec_at?: string | null
          last_tick_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trader_state: {
        Row: {
          autonomy_mode: boolean | null
          balance: number
          council_reasons: string[] | null
          council_votes: string | null
          id: string
          portfolio_value: number | null
          progress_percent: number | null
          swarm_active: boolean
          todays_profit: number
          updated_at: string
          user_id: string
          win_rate: number | null
          withdraw_status: string | null
        }
        Insert: {
          autonomy_mode?: boolean | null
          balance?: number
          council_reasons?: string[] | null
          council_votes?: string | null
          id?: string
          portfolio_value?: number | null
          progress_percent?: number | null
          swarm_active?: boolean
          todays_profit?: number
          updated_at?: string
          user_id: string
          win_rate?: number | null
          withdraw_status?: string | null
        }
        Update: {
          autonomy_mode?: boolean | null
          balance?: number
          council_reasons?: string[] | null
          council_votes?: string | null
          id?: string
          portfolio_value?: number | null
          progress_percent?: number | null
          swarm_active?: boolean
          todays_profit?: number
          updated_at?: string
          user_id?: string
          win_rate?: number | null
          withdraw_status?: string | null
        }
        Relationships: []
      }
      trades: {
        Row: {
          created_at: string
          id: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          user_id?: string
        }
        Relationships: []
      }
      trading_fills: {
        Row: {
          cost_usd: number
          fee_usd: number | null
          filled_at: string | null
          id: string
          kraken_txid: string | null
          order_id: string | null
          pair: string
          price: number
          realized_pnl: number | null
          side: string
          user_id: string
          volume: number
        }
        Insert: {
          cost_usd: number
          fee_usd?: number | null
          filled_at?: string | null
          id?: string
          kraken_txid?: string | null
          order_id?: string | null
          pair: string
          price: number
          realized_pnl?: number | null
          side: string
          user_id: string
          volume: number
        }
        Update: {
          cost_usd?: number
          fee_usd?: number | null
          filled_at?: string | null
          id?: string
          kraken_txid?: string | null
          order_id?: string | null
          pair?: string
          price?: number
          realized_pnl?: number | null
          side?: string
          user_id?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "trading_fills_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "trading_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_orders: {
        Row: {
          closed_at: string | null
          cost_usd: number | null
          created_at: string | null
          fee_usd: number | null
          id: string
          intent_id: string | null
          kraken_txid: string | null
          order_type: string | null
          pair: string
          price: number | null
          reject_reason: string | null
          side: string
          status: string | null
          updated_at: string | null
          user_id: string
          volume: number
        }
        Insert: {
          closed_at?: string | null
          cost_usd?: number | null
          created_at?: string | null
          fee_usd?: number | null
          id?: string
          intent_id?: string | null
          kraken_txid?: string | null
          order_type?: string | null
          pair: string
          price?: number | null
          reject_reason?: string | null
          side: string
          status?: string | null
          updated_at?: string | null
          user_id: string
          volume: number
        }
        Update: {
          closed_at?: string | null
          cost_usd?: number | null
          created_at?: string | null
          fee_usd?: number | null
          id?: string
          intent_id?: string | null
          kraken_txid?: string | null
          order_type?: string | null
          pair?: string
          price?: number | null
          reject_reason?: string | null
          side?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
          volume?: number
        }
        Relationships: []
      }
      user_bot_daily_stats: {
        Row: {
          day: string
          id: string
          orders_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          day?: string
          id?: string
          orders_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          day?: string
          id?: string
          orders_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_exchange_keys: {
        Row: {
          alpaca_api_key: string | null
          alpaca_paper: boolean | null
          alpaca_secret: string | null
          chime_account_name: string | null
          chime_account_number: string | null
          chime_routing_number: string | null
          created_at: string
          default_stop_loss_percent: number | null
          default_take_profit_percent: number | null
          id: string
          kraken_key: string | null
          kraken_secret: string | null
          kraken_withdraw_key: string | null
          max_position_percent: number | null
          openai_api_key: string | null
          openai_enabled: boolean | null
          openai_model: string | null
          plaid_client_id: string | null
          plaid_env: string | null
          plaid_secret: string | null
          trailing_stop_percent: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alpaca_api_key?: string | null
          alpaca_paper?: boolean | null
          alpaca_secret?: string | null
          chime_account_name?: string | null
          chime_account_number?: string | null
          chime_routing_number?: string | null
          created_at?: string
          default_stop_loss_percent?: number | null
          default_take_profit_percent?: number | null
          id?: string
          kraken_key?: string | null
          kraken_secret?: string | null
          kraken_withdraw_key?: string | null
          max_position_percent?: number | null
          openai_api_key?: string | null
          openai_enabled?: boolean | null
          openai_model?: string | null
          plaid_client_id?: string | null
          plaid_env?: string | null
          plaid_secret?: string | null
          trailing_stop_percent?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alpaca_api_key?: string | null
          alpaca_paper?: boolean | null
          alpaca_secret?: string | null
          chime_account_name?: string | null
          chime_account_number?: string | null
          chime_routing_number?: string | null
          created_at?: string
          default_stop_loss_percent?: number | null
          default_take_profit_percent?: number | null
          id?: string
          kraken_key?: string | null
          kraken_secret?: string | null
          kraken_withdraw_key?: string | null
          max_position_percent?: number | null
          openai_api_key?: string | null
          openai_enabled?: boolean | null
          openai_model?: string | null
          plaid_client_id?: string | null
          plaid_env?: string | null
          plaid_secret?: string | null
          trailing_stop_percent?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          amount: number
          bank_name: string | null
          created_at: string
          id: string
          status: string
          user_id: string
          withdraw_type: string | null
        }
        Insert: {
          amount: number
          bank_name?: string | null
          created_at?: string
          id?: string
          status?: string
          user_id: string
          withdraw_type?: string | null
        }
        Update: {
          amount?: number
          bank_name?: string | null
          created_at?: string
          id?: string
          status?: string
          user_id?: string
          withdraw_type?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_portfolio_snapshot: { Args: { p_user_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      update_trader_state_from_webhook:
        | {
            Args: {
              p_balance?: number
              p_council_reasons?: string[]
              p_council_votes?: string
              p_portfolio_value?: number
              p_profit?: number
              p_progress_percent?: number
              p_trade_message?: string
              p_user_id: string
              p_win_rate?: number
              p_withdraw_status?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_balance: number
              p_profit: number
              p_trade_message: string
              p_user_id: string
            }
            Returns: undefined
          }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
