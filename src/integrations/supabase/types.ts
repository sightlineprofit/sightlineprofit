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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_groups: {
        Row: {
          color: string
          created_at: string
          firm_id: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          firm_id: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          firm_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_groups_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_types: {
        Row: {
          color: string | null
          created_at: string
          firm_id: string
          id: string
          is_billable: boolean
          is_default: boolean
          is_system: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          firm_id: string
          id?: string
          is_billable?: boolean
          is_default?: boolean
          is_system?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          firm_id?: string
          id?: string
          is_billable?: boolean
          is_default?: boolean
          is_system?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_types_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      aligned_rate_history: {
        Row: {
          change_reason: string | null
          changed_at: string
          firm_id: string
          id: string
          previous_rate: number | null
          rate: number
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string
          firm_id: string
          id?: string
          previous_rate?: number | null
          rate: number
        }
        Update: {
          change_reason?: string | null
          changed_at?: string
          firm_id?: string
          id?: string
          previous_rate?: number | null
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "aligned_rate_history_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          default_activity_groups: Json
          id: number
          maintenance_mode: boolean
          updated_at: string
        }
        Insert: {
          default_activity_groups?: Json
          id?: number
          maintenance_mode?: boolean
          updated_at?: string
        }
        Update: {
          default_activity_groups?: Json
          id?: number
          maintenance_mode?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amort_months: number | null
          amount: number
          category: string | null
          created_at: string
          firm_id: string
          frequency: Database["public"]["Enums"]["expense_frequency"]
          id: string
          name: string
          recurring: boolean
        }
        Insert: {
          amort_months?: number | null
          amount: number
          category?: string | null
          created_at?: string
          firm_id: string
          frequency: Database["public"]["Enums"]["expense_frequency"]
          id?: string
          name: string
          recurring?: boolean
        }
        Update: {
          amort_months?: number | null
          amount?: number
          category?: string | null
          created_at?: string
          firm_id?: string
          frequency?: Database["public"]["Enums"]["expense_frequency"]
          id?: string
          name?: string
          recurring?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "expenses_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_action_commitments: {
        Row: {
          action_type: string
          committed_at: string
          created_at: string
          created_by: string | null
          firm_id: string
          id: string
          notes: string | null
          outcome: string | null
          resolved_at: string | null
          scenario_group: string | null
          settings_updated: boolean
          target_value: number | null
          updated_at: string
        }
        Insert: {
          action_type: string
          committed_at?: string
          created_at?: string
          created_by?: string | null
          firm_id: string
          id?: string
          notes?: string | null
          outcome?: string | null
          resolved_at?: string | null
          scenario_group?: string | null
          settings_updated?: boolean
          target_value?: number | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          committed_at?: string
          created_at?: string
          created_by?: string | null
          firm_id?: string
          id?: string
          notes?: string | null
          outcome?: string | null
          resolved_at?: string | null
          scenario_group?: string | null
          settings_updated?: boolean
          target_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_action_commitments_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_change_log: {
        Row: {
          category: Database["public"]["Enums"]["change_log_category"]
          changed_by: string | null
          changed_by_name: string | null
          changed_fields: Json
          created_at: string
          entity_label: string
          firm_id: string
          id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["change_log_category"]
          changed_by?: string | null
          changed_by_name?: string | null
          changed_fields?: Json
          created_at?: string
          entity_label: string
          firm_id: string
          id?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["change_log_category"]
          changed_by?: string | null
          changed_by_name?: string | null
          changed_fields?: Json
          created_at?: string
          entity_label?: string
          firm_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_change_log_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_config: {
        Row: {
          accounting_basis: string
          actual_billed_rate: number | null
          aligned_rate_at_signup: number | null
          available_hrs_per_week: number | null
          business_structure: string | null
          capacity_constrained_indicator: string
          comp_distribution_annual: number | null
          comp_draw_annual: number | null
          comp_health_annual: number | null
          comp_ptax_pct: number | null
          comp_reserve_mode: string
          comp_reserve_target_annual: number | null
          comp_retire_annual: number | null
          firm_id: string
          growth_signals: Json
          planned_activity_allocation: Json
          rate_billed: number | null
          rate_insight_shown: boolean
          target_billable_hrs_per_week: number | null
          target_gross_margin_pct: number | null
          updated_at: string
        }
        Insert: {
          accounting_basis?: string
          actual_billed_rate?: number | null
          aligned_rate_at_signup?: number | null
          available_hrs_per_week?: number | null
          business_structure?: string | null
          capacity_constrained_indicator?: string
          comp_distribution_annual?: number | null
          comp_draw_annual?: number | null
          comp_health_annual?: number | null
          comp_ptax_pct?: number | null
          comp_reserve_mode?: string
          comp_reserve_target_annual?: number | null
          comp_retire_annual?: number | null
          firm_id: string
          growth_signals?: Json
          planned_activity_allocation?: Json
          rate_billed?: number | null
          rate_insight_shown?: boolean
          target_billable_hrs_per_week?: number | null
          target_gross_margin_pct?: number | null
          updated_at?: string
        }
        Update: {
          accounting_basis?: string
          actual_billed_rate?: number | null
          aligned_rate_at_signup?: number | null
          available_hrs_per_week?: number | null
          business_structure?: string | null
          capacity_constrained_indicator?: string
          comp_distribution_annual?: number | null
          comp_draw_annual?: number | null
          comp_health_annual?: number | null
          comp_ptax_pct?: number | null
          comp_reserve_mode?: string
          comp_reserve_target_annual?: number | null
          comp_retire_annual?: number | null
          firm_id?: string
          growth_signals?: Json
          planned_activity_allocation?: Json
          rate_billed?: number | null
          rate_insight_shown?: boolean
          target_billable_hrs_per_week?: number | null
          target_gross_margin_pct?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_config_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: true
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_members: {
        Row: {
          annual_base_salary: number | null
          annual_benefits: number | null
          billed_rate: number | null
          burdened_hourly_rate: number | null
          burdened_weekly_cost: number | null
          compensation_type: string
          created_at: string
          email: string | null
          employer_payroll_tax_pct: number | null
          employer_tax_rate_is_custom: boolean
          employment_type: string
          expected_hrs_per_week: number | null
          firm_id: string
          hourly_wage: number | null
          id: string
          invite_accepted_at: string | null
          invite_sent_at: string | null
          is_active: boolean
          is_platform_user: boolean
          name: string
          notes: string | null
          other_annual_costs: number | null
          profile_id: string | null
          role_type: string
          updated_at: string
          weeks_per_year: number | null
        }
        Insert: {
          annual_base_salary?: number | null
          annual_benefits?: number | null
          billed_rate?: number | null
          burdened_hourly_rate?: number | null
          burdened_weekly_cost?: number | null
          compensation_type?: string
          created_at?: string
          email?: string | null
          employer_payroll_tax_pct?: number | null
          employer_tax_rate_is_custom?: boolean
          employment_type?: string
          expected_hrs_per_week?: number | null
          firm_id: string
          hourly_wage?: number | null
          id?: string
          invite_accepted_at?: string | null
          invite_sent_at?: string | null
          is_active?: boolean
          is_platform_user?: boolean
          name: string
          notes?: string | null
          other_annual_costs?: number | null
          profile_id?: string | null
          role_type: string
          updated_at?: string
          weeks_per_year?: number | null
        }
        Update: {
          annual_base_salary?: number | null
          annual_benefits?: number | null
          billed_rate?: number | null
          burdened_hourly_rate?: number | null
          burdened_weekly_cost?: number | null
          compensation_type?: string
          created_at?: string
          email?: string | null
          employer_payroll_tax_pct?: number | null
          employer_tax_rate_is_custom?: boolean
          employment_type?: string
          expected_hrs_per_week?: number | null
          firm_id?: string
          hourly_wage?: number | null
          id?: string
          invite_accepted_at?: string | null
          invite_sent_at?: string | null
          is_active?: boolean
          is_platform_user?: boolean
          name?: string
          notes?: string | null
          other_annual_costs?: number | null
          profile_id?: string | null
          role_type?: string
          updated_at?: string
          weeks_per_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_members_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_signal_state: {
        Row: {
          cost_gap_pct: number | null
          created_at: string
          cycle_count: number
          firm_id: string
          id: string
          last_action_suggested_at: string | null
          last_action_type: string | null
          last_metric_snapshot: Json | null
          pricing_gap_pct: number | null
          primary_profile: string | null
          updated_at: string
          util_gap_pct: number | null
        }
        Insert: {
          cost_gap_pct?: number | null
          created_at?: string
          cycle_count?: number
          firm_id: string
          id?: string
          last_action_suggested_at?: string | null
          last_action_type?: string | null
          last_metric_snapshot?: Json | null
          pricing_gap_pct?: number | null
          primary_profile?: string | null
          updated_at?: string
          util_gap_pct?: number | null
        }
        Update: {
          cost_gap_pct?: number | null
          created_at?: string
          cycle_count?: number
          firm_id?: string
          id?: string
          last_action_suggested_at?: string | null
          last_action_type?: string | null
          last_metric_snapshot?: Json | null
          pricing_gap_pct?: number | null
          primary_profile?: string | null
          updated_at?: string
          util_gap_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_signal_state_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: true
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firms: {
        Row: {
          billing_frequency: string
          created_at: string
          current_period_end: string | null
          data_status: string
          default_landing_page: string | null
          id: string
          is_demo: boolean
          last_demo_loaded_at: string | null
          last_reset_at: string | null
          name: string
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          owner_id: string
          past_due_since: string | null
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          subscription_tier: Database["public"]["Enums"]["subscription_tier"]
          trial_ends_at: string
          welcome_banner_dismissed: boolean
        }
        Insert: {
          billing_frequency?: string
          created_at?: string
          current_period_end?: string | null
          data_status?: string
          default_landing_page?: string | null
          id?: string
          is_demo?: boolean
          last_demo_loaded_at?: string | null
          last_reset_at?: string | null
          name: string
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          owner_id: string
          past_due_since?: string | null
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          trial_ends_at?: string
          welcome_banner_dismissed?: boolean
        }
        Update: {
          billing_frequency?: string
          created_at?: string
          current_period_end?: string | null
          data_status?: string
          default_landing_page?: string | null
          id?: string
          is_demo?: boolean
          last_demo_loaded_at?: string | null
          last_reset_at?: string | null
          name?: string
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          owner_id?: string
          past_due_since?: string | null
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          trial_ends_at?: string
          welcome_banner_dismissed?: boolean
        }
        Relationships: []
      }
      founding_access: {
        Row: {
          firm_id: string
          granted_at: string
          stripe_price_id: string
        }
        Insert: {
          firm_id: string
          granted_at?: string
          stripe_price_id: string
        }
        Update: {
          firm_id?: string
          granted_at?: string
          stripe_price_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "founding_access_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: true
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_projects: {
        Row: {
          created_at: string
          firm_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          firm_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          firm_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_projects_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: true
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          body: string | null
          category: Database["public"]["Enums"]["kb_category"]
          created_at: string
          excerpt: string | null
          id: string
          kind: Database["public"]["Enums"]["kb_kind"]
          published_at: string | null
          read_minutes: number | null
          slug: string
          thumbnail_url: string | null
          title: string
          video_url: string | null
        }
        Insert: {
          body?: string | null
          category: Database["public"]["Enums"]["kb_category"]
          created_at?: string
          excerpt?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["kb_kind"]
          published_at?: string | null
          read_minutes?: number | null
          slug: string
          thumbnail_url?: string | null
          title: string
          video_url?: string | null
        }
        Update: {
          body?: string | null
          category?: Database["public"]["Enums"]["kb_category"]
          created_at?: string
          excerpt?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["kb_kind"]
          published_at?: string | null
          read_minutes?: number | null
          slug?: string
          thumbnail_url?: string | null
          title?: string
          video_url?: string | null
        }
        Relationships: []
      }
      knowledge_base_items: {
        Row: {
          body: Json | null
          category: string
          created_at: string
          created_by: string | null
          featured: boolean
          id: string
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["kb_status"]
          summary: string | null
          tags: string[]
          thumbnail_path: string | null
          tier_visibility: string[]
          title: string
          type: Database["public"]["Enums"]["kb_item_type"]
          updated_at: string
          video_file_path: string | null
          video_url: string | null
        }
        Insert: {
          body?: Json | null
          category: string
          created_at?: string
          created_by?: string | null
          featured?: boolean
          id?: string
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["kb_status"]
          summary?: string | null
          tags?: string[]
          thumbnail_path?: string | null
          tier_visibility?: string[]
          title: string
          type: Database["public"]["Enums"]["kb_item_type"]
          updated_at?: string
          video_file_path?: string | null
          video_url?: string | null
        }
        Update: {
          body?: Json | null
          category?: string
          created_at?: string
          created_by?: string | null
          featured?: boolean
          id?: string
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["kb_status"]
          summary?: string | null
          tags?: string[]
          thumbnail_path?: string | null
          tier_visibility?: string[]
          title?: string
          type?: Database["public"]["Enums"]["kb_item_type"]
          updated_at?: string
          video_file_path?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      manual_hour_logs: {
        Row: {
          billable_hrs: number
          created_at: string
          firm_id: string
          id: string
          non_billable_hrs: number
          notes: string | null
          period_start: string
          period_type: Database["public"]["Enums"]["manual_hour_period"]
          total_hrs_worked: number
          updated_at: string
          user_id: string
        }
        Insert: {
          billable_hrs?: number
          created_at?: string
          firm_id: string
          id?: string
          non_billable_hrs?: number
          notes?: string | null
          period_start: string
          period_type: Database["public"]["Enums"]["manual_hour_period"]
          total_hrs_worked?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          billable_hrs?: number
          created_at?: string
          firm_id?: string
          id?: string
          non_billable_hrs?: number
          notes?: string | null
          period_start?: string
          period_type?: Database["public"]["Enums"]["manual_hour_period"]
          total_hrs_worked?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      owner_compensation: {
        Row: {
          comp_draw_annual: number | null
          compensation_notes: string | null
          created_at: string
          distribution_annual: number | null
          employee_payroll_tax_pct: number | null
          firm_id: string
          health_insurance_annual: number | null
          id: string
          payroll_tax_pct: number | null
          profile_id: string
          reserve_months: number | null
          reserve_target: number | null
          retirement_annual: number | null
          updated_at: string
        }
        Insert: {
          comp_draw_annual?: number | null
          compensation_notes?: string | null
          created_at?: string
          distribution_annual?: number | null
          employee_payroll_tax_pct?: number | null
          firm_id: string
          health_insurance_annual?: number | null
          id?: string
          payroll_tax_pct?: number | null
          profile_id: string
          reserve_months?: number | null
          reserve_target?: number | null
          retirement_annual?: number | null
          updated_at?: string
        }
        Update: {
          comp_draw_annual?: number | null
          compensation_notes?: string | null
          created_at?: string
          distribution_annual?: number | null
          employee_payroll_tax_pct?: number | null
          firm_id?: string
          health_insurance_annual?: number | null
          id?: string
          payroll_tax_pct?: number | null
          profile_id?: string
          reserve_months?: number | null
          reserve_target?: number | null
          retirement_annual?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_compensation_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_compensation_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_projects: {
        Row: {
          assigned_user_ids: string[] | null
          billing_type: string | null
          client_name: string | null
          created_at: string
          estimated_end: string | null
          estimated_hrs: number | null
          estimated_start: string | null
          firm_id: string
          fixed_fee: number | null
          id: string
          name: string
          notes: string | null
          probability_pct: number | null
          scoped_rate: number | null
          sop_template_id: string | null
        }
        Insert: {
          assigned_user_ids?: string[] | null
          billing_type?: string | null
          client_name?: string | null
          created_at?: string
          estimated_end?: string | null
          estimated_hrs?: number | null
          estimated_start?: string | null
          firm_id: string
          fixed_fee?: number | null
          id?: string
          name: string
          notes?: string | null
          probability_pct?: number | null
          scoped_rate?: number | null
          sop_template_id?: string | null
        }
        Update: {
          assigned_user_ids?: string[] | null
          billing_type?: string | null
          client_name?: string | null
          created_at?: string
          estimated_end?: string | null
          estimated_hrs?: number | null
          estimated_start?: string | null
          firm_id?: string
          fixed_fee?: number | null
          id?: string
          name?: string
          notes?: string | null
          probability_pct?: number | null
          scoped_rate?: number | null
          sop_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_projects_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_projects_sop_template_id_fkey"
            columns: ["sop_template_id"]
            isOneToOne: false
            referencedRelation: "sop_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accepted_at: string | null
          billable_pct: number | null
          billable_rate: number | null
          color: string
          cost_rate: number | null
          created_at: string
          email: string
          expected_hrs_per_week: number | null
          firm_id: string | null
          id: string
          impersonated_firm_id: string | null
          invited_at: string | null
          is_super_admin: boolean
          name: string
          preferred_home: string | null
          role: Database["public"]["Enums"]["user_role"]
          weeks_per_year: number | null
          welcomed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          billable_pct?: number | null
          billable_rate?: number | null
          color?: string
          cost_rate?: number | null
          created_at?: string
          email: string
          expected_hrs_per_week?: number | null
          firm_id?: string | null
          id: string
          impersonated_firm_id?: string | null
          invited_at?: string | null
          is_super_admin?: boolean
          name?: string
          preferred_home?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          weeks_per_year?: number | null
          welcomed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          billable_pct?: number | null
          billable_rate?: number | null
          color?: string
          cost_rate?: number | null
          created_at?: string
          email?: string
          expected_hrs_per_week?: number | null
          firm_id?: string | null
          id?: string
          impersonated_firm_id?: string | null
          invited_at?: string | null
          is_super_admin?: boolean
          name?: string
          preferred_home?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          weeks_per_year?: number | null
          welcomed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      project_activity_log: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["project_activity_event"]
          firm_id: string
          id: string
          logged_by: string | null
          note: string | null
          occurred_at: string
          project_id: string
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["project_activity_event"]
          firm_id: string
          id?: string
          logged_by?: string | null
          note?: string | null
          occurred_at?: string
          project_id: string
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["project_activity_event"]
          firm_id?: string
          id?: string
          logged_by?: string | null
          note?: string | null
          occurred_at?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_log_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignments: {
        Row: {
          project_id: string
          user_id: string
        }
        Insert: {
          project_id: string
          user_id: string
        }
        Update: {
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_financial_audit: {
        Row: {
          changed_at: string
          changed_by: string
          field_changed: string
          firm_id: string
          id: string
          new_value: string | null
          old_value: string | null
          project_id: string
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          field_changed: string
          firm_id: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          project_id: string
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          field_changed?: string
          firm_id?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          project_id?: string
          reason?: string | null
        }
        Relationships: []
      }
      project_milestones: {
        Row: {
          created_at: string
          firm_id: string
          id: string
          label: string
          milestone_date: string
          project_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          firm_id: string
          id?: string
          label: string
          milestone_date: string
          project_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          firm_id?: string
          id?: string
          label?: string
          milestone_date?: string
          project_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_phases: {
        Row: {
          actual_hrs: number
          billable: boolean
          expected_hrs: number
          id: string
          name: string
          phase_over_scope: boolean
          project_id: string
          sop_phase_id: string | null
          sort_order: number
        }
        Insert: {
          actual_hrs?: number
          billable?: boolean
          expected_hrs?: number
          id?: string
          name: string
          phase_over_scope?: boolean
          project_id: string
          sop_phase_id?: string | null
          sort_order?: number
        }
        Update: {
          actual_hrs?: number
          billable?: boolean
          expected_hrs?: number
          id?: string
          name?: string
          phase_over_scope?: boolean
          project_id?: string
          sop_phase_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_phases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_phases_sop_phase_id_fkey"
            columns: ["sop_phase_id"]
            isOneToOne: false
            referencedRelation: "sop_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      project_steps: {
        Row: {
          actual_hrs: number
          created_at: string
          description: string
          estimated_hrs: number
          id: string
          is_custom: boolean
          project_phase_id: string
          sop_step_id: string | null
          sort_order: number
          template_estimated_hrs: number | null
        }
        Insert: {
          actual_hrs?: number
          created_at?: string
          description: string
          estimated_hrs?: number
          id?: string
          is_custom?: boolean
          project_phase_id: string
          sop_step_id?: string | null
          sort_order?: number
          template_estimated_hrs?: number | null
        }
        Update: {
          actual_hrs?: number
          created_at?: string
          description?: string
          estimated_hrs?: number
          id?: string
          is_custom?: boolean
          project_phase_id?: string
          sop_step_id?: string | null
          sort_order?: number
          template_estimated_hrs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_steps_project_phase_id_fkey"
            columns: ["project_phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_steps_sop_step_id_fkey"
            columns: ["sop_step_id"]
            isOneToOne: false
            referencedRelation: "sop_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_name: string | null
          created_at: string
          end_date: string | null
          est_weekly_hrs: number | null
          firm_id: string
          fixed_fee: number | null
          id: string
          last_confirmed_at: string | null
          name: string
          scoped_hrs: number | null
          scoped_rate: number | null
          sop_template_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          end_date?: string | null
          est_weekly_hrs?: number | null
          firm_id: string
          fixed_fee?: number | null
          id?: string
          last_confirmed_at?: string | null
          name: string
          scoped_hrs?: number | null
          scoped_rate?: number | null
          sop_template_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
        }
        Update: {
          client_name?: string | null
          created_at?: string
          end_date?: string | null
          est_weekly_hrs?: number | null
          firm_id?: string
          fixed_fee?: number | null
          id?: string
          last_confirmed_at?: string | null
          name?: string
          scoped_hrs?: number | null
          scoped_rate?: number | null
          sop_template_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
        }
        Relationships: [
          {
            foreignKeyName: "projects_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_sop_template_id_fkey"
            columns: ["sop_template_id"]
            isOneToOne: false
            referencedRelation: "sop_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarios: {
        Row: {
          created_at: string
          created_by: string
          firm_id: string
          id: string
          name: string
          payload: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          firm_id: string
          id?: string
          name: string
          payload?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          firm_id?: string
          id?: string
          name?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      sop_phases: {
        Row: {
          billable: boolean
          description: string | null
          expected_hrs: number
          firm_id: string
          id: string
          name: string
          sort_order: number
          template_id: string
          time_benchmark_notes: string | null
        }
        Insert: {
          billable?: boolean
          description?: string | null
          expected_hrs?: number
          firm_id: string
          id?: string
          name: string
          sort_order?: number
          template_id: string
          time_benchmark_notes?: string | null
        }
        Update: {
          billable?: boolean
          description?: string | null
          expected_hrs?: number
          firm_id?: string
          id?: string
          name?: string
          sort_order?: number
          template_id?: string
          time_benchmark_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sop_phases_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_phases_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "sop_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_steps: {
        Row: {
          description: string
          estimated_hrs: number
          id: string
          phase_id: string
          sort_order: number
        }
        Insert: {
          description: string
          estimated_hrs?: number
          id?: string
          phase_id: string
          sort_order?: number
        }
        Update: {
          description?: string
          estimated_hrs?: number
          id?: string
          phase_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "sop_steps_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "sop_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_templates: {
        Row: {
          category: string | null
          common_failure_modes: string | null
          created_at: string
          deleted_at: string | null
          department: string | null
          description: string | null
          done_when: string | null
          firm_id: string
          id: string
          is_default: boolean
          name: string
          scope_risk_level: Database["public"]["Enums"]["scope_risk"] | null
          tags: string[] | null
          triggered_by: string | null
        }
        Insert: {
          category?: string | null
          common_failure_modes?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          description?: string | null
          done_when?: string | null
          firm_id: string
          id?: string
          is_default?: boolean
          name: string
          scope_risk_level?: Database["public"]["Enums"]["scope_risk"] | null
          tags?: string[] | null
          triggered_by?: string | null
        }
        Update: {
          category?: string | null
          common_failure_modes?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          description?: string | null
          done_when?: string | null
          firm_id?: string
          id?: string
          is_default?: boolean
          name?: string
          scope_risk_level?: Database["public"]["Enums"]["scope_risk"] | null
          tags?: string[] | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sop_templates_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          received_at: string
          type: string
        }
        Insert: {
          event_id: string
          received_at?: string
          type: string
        }
        Update: {
          event_id?: string
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          billable_pct: number | null
          billable_rate: number | null
          cost_rate: number | null
          email: string
          expected_hrs_per_week: number | null
          firm_id: string
          id: string
          invite_token_expiry: string
          invited_at: string
          invited_by: string
          name: string | null
          role: Database["public"]["Enums"]["user_role"]
          token: string
          weeks_per_year: number | null
        }
        Insert: {
          accepted_at?: string | null
          billable_pct?: number | null
          billable_rate?: number | null
          cost_rate?: number | null
          email: string
          expected_hrs_per_week?: number | null
          firm_id: string
          id?: string
          invite_token_expiry?: string
          invited_at?: string
          invited_by: string
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          token?: string
          weeks_per_year?: number | null
        }
        Update: {
          accepted_at?: string | null
          billable_pct?: number | null
          billable_rate?: number | null
          cost_rate?: number | null
          email?: string
          expected_hrs_per_week?: number | null
          firm_id?: string
          id?: string
          invite_token_expiry?: string
          invited_at?: string
          invited_by?: string
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          token?: string
          weeks_per_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          activity_group_id: string | null
          activity_reassigned: boolean
          activity_reassigned_at: string | null
          activity_reassigned_from: string | null
          activity_type_id: string | null
          billable: boolean
          cost_rate_at_time: number | null
          created_at: string
          date: string
          description: string | null
          end_time: string | null
          firm_id: string
          hrs: number
          id: string
          notes: string | null
          project_id: string | null
          project_phase_id: string | null
          start_time: string | null
          user_id: string
        }
        Insert: {
          activity_group_id?: string | null
          activity_reassigned?: boolean
          activity_reassigned_at?: string | null
          activity_reassigned_from?: string | null
          activity_type_id?: string | null
          billable?: boolean
          cost_rate_at_time?: number | null
          created_at?: string
          date: string
          description?: string | null
          end_time?: string | null
          firm_id: string
          hrs?: number
          id?: string
          notes?: string | null
          project_id?: string | null
          project_phase_id?: string | null
          start_time?: string | null
          user_id: string
        }
        Update: {
          activity_group_id?: string | null
          activity_reassigned?: boolean
          activity_reassigned_at?: string | null
          activity_reassigned_from?: string | null
          activity_type_id?: string | null
          billable?: boolean
          cost_rate_at_time?: number | null
          created_at?: string
          date?: string
          description?: string | null
          end_time?: string | null
          firm_id?: string
          hrs?: number
          id?: string
          notes?: string | null
          project_id?: string | null
          project_phase_id?: string | null
          start_time?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_activity_group_id_fkey"
            columns: ["activity_group_id"]
            isOneToOne: false
            referencedRelation: "activity_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "activity_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_phase_id_fkey"
            columns: ["project_phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_metric_prefs: {
        Row: {
          hidden_metrics: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          hidden_metrics?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          hidden_metrics?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_sop_preferences: {
        Row: {
          created_at: string
          hidden: boolean
          hidden_at: string | null
          id: string
          template_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hidden?: boolean
          hidden_at?: string | null
          id?: string
          template_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hidden?: boolean
          hidden_at?: string | null
          id?: string
          template_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_log: {
        Row: {
          created_at: string
          delivered_at: string | null
          error: string | null
          event_tag: string
          firm_id: string | null
          id: string
          payload: Json
          recipient_email: string | null
          status: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          event_tag: string
          firm_id?: string | null
          id?: string
          payload?: Json
          recipient_email?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          event_tag?: string
          firm_id?: string | null
          id?: string
          payload?: Json
          recipient_email?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_firm_id: { Args: never; Returns: string }
      current_firm_tier: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_firm_internal_project: {
        Args: { p_firm_id: string }
        Returns: string
      }
      founding_slots_remaining: { Args: never; Returns: number }
      get_user_firm_id: { Args: never; Returns: string }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_firm_admin: { Args: never; Returns: boolean }
      is_firm_principal: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      save_time_entry: {
        Args: { p_entry: Json }
        Returns: {
          activity_group_id: string | null
          activity_reassigned: boolean
          activity_reassigned_at: string | null
          activity_reassigned_from: string | null
          activity_type_id: string | null
          billable: boolean
          cost_rate_at_time: number | null
          created_at: string
          date: string
          description: string | null
          end_time: string | null
          firm_id: string
          hrs: number
          id: string
          notes: string | null
          project_id: string | null
          project_phase_id: string | null
          start_time: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      seed_firm_activity_types: {
        Args: { p_firm_id: string }
        Returns: undefined
      }
    }
    Enums: {
      change_log_category:
        | "rate_architecture"
        | "owner_compensation"
        | "team_cost"
        | "team_capacity"
        | "operating_expenses"
      expense_frequency: "annual" | "monthly" | "quarterly" | "onetime"
      kb_category:
        | "rate_architecture"
        | "cash_management"
        | "team_growth"
        | "using_sightline"
      kb_item_type: "article" | "video"
      kb_kind: "article" | "video"
      kb_status: "draft" | "published"
      manual_hour_period: "week" | "month"
      project_activity_event: "nothing_to_report" | "confirmed_reviewed"
      project_status:
        | "active"
        | "pipeline"
        | "completed"
        | "on_hold"
        | "pursuit"
        | "invoiced"
        | "collected"
      scope_risk: "low" | "medium" | "high"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
      subscription_tier: "studio" | "practice"
      user_role: "principal" | "admin" | "team" | "view_only"
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
      change_log_category: [
        "rate_architecture",
        "owner_compensation",
        "team_cost",
        "team_capacity",
        "operating_expenses",
      ],
      expense_frequency: ["annual", "monthly", "quarterly", "onetime"],
      kb_category: [
        "rate_architecture",
        "cash_management",
        "team_growth",
        "using_sightline",
      ],
      kb_item_type: ["article", "video"],
      kb_kind: ["article", "video"],
      kb_status: ["draft", "published"],
      manual_hour_period: ["week", "month"],
      project_activity_event: ["nothing_to_report", "confirmed_reviewed"],
      project_status: [
        "active",
        "pipeline",
        "completed",
        "on_hold",
        "pursuit",
        "invoiced",
        "collected",
      ],
      scope_risk: ["low", "medium", "high"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
      ],
      subscription_tier: ["studio", "practice"],
      user_role: ["principal", "admin", "team", "view_only"],
    },
  },
} as const
