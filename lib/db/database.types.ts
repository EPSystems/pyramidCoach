
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "app_config": {
                  Row: {
                    "key": string,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"value": string
                  }
                  Update: {
                    "key"?: string,"value"?: string
                  }
                  Relationships: [
                    
                  ]
                },"blocks": {
                  Row: {
                    "created_at": string | null,"engine_version": string,"explanations": NonNullable<Json>,"id": string,"inputs_snapshot": NonNullable<Json>,"intro_week": boolean,"kind": string,"median_target": number | null,"schedule": NonNullable<Json>,"selections": NonNullable<Json>,"split_key": string,"starts_on": string,"status": string,"user_id": string,"warnings": NonNullable<Json>,"weeks": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"engine_version": string,"explanations"?: NonNullable<Json>,"id"?: string,"inputs_snapshot": NonNullable<Json>,"intro_week"?: boolean,"kind": string,"median_target"?: number | null,"schedule"?: NonNullable<Json>,"selections"?: NonNullable<Json>,"split_key": string,"starts_on": string,"status"?: string,"user_id": string,"warnings"?: NonNullable<Json>,"weeks": number
                  }
                  Update: {
                    "created_at"?: string | null,"engine_version"?: string,"explanations"?: NonNullable<Json>,"id"?: string,"inputs_snapshot"?: NonNullable<Json>,"intro_week"?: boolean,"kind"?: string,"median_target"?: number | null,"schedule"?: NonNullable<Json>,"selections"?: NonNullable<Json>,"split_key"?: string,"starts_on"?: string,"status"?: string,"user_id"?: string,"warnings"?: NonNullable<Json>,"weeks"?: number
                  }
                  Relationships: [
                    
                  ]
                },"checkins": {
                  Row: {
                    "bodyweight_kg": number | null,"day": string,"energy": number | null,"note": string | null,"sleep_hours": number | null,"soreness": NonNullable<Json>,"stress": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bodyweight_kg"?: number | null,"day": string,"energy"?: number | null,"note"?: string | null,"sleep_hours"?: number | null,"soreness"?: NonNullable<Json>,"stress"?: number | null,"user_id": string
                  }
                  Update: {
                    "bodyweight_kg"?: number | null,"day"?: string,"energy"?: number | null,"note"?: string | null,"sleep_hours"?: number | null,"soreness"?: NonNullable<Json>,"stress"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"exercise_muscles": {
                  Row: {
                    "exercise_id": string,"muscle_id": string,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "exercise_id": string,"muscle_id": string,"role": string
                  }
                  Update: {
                    "exercise_id"?: string,"muscle_id"?: string,"role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exercise_muscles_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exercise_muscles_muscle_id_fkey"
      columns: ["muscle_id"]
isOneToOne: false
      referencedRelation: "muscles"
      referencedColumns: ["id"]
    }
                  ]
                },"exercises": {
                  Row: {
                    "axial_load": boolean | null,"category": string,"created_at": string | null,"cues": (string)[],"default_increment_kg": number | null,"equipment": (string)[],"id": string,"impact_lower_body": boolean | null,"is_main_lift": boolean | null,"long_length_bias": boolean | null,"main_lift_key": string | null,"mistakes": (string)[],"name": string,"owner_user_id": string | null,"pattern_id": string | null,"popularity": number,"slot_tags": (string)[],"slug": string,"substitutions": (string)[],"unilateral": boolean | null
                  }
                  ComputedFields: never
                  Insert: {
                    "axial_load"?: boolean | null,"category": string,"created_at"?: string | null,"cues"?: (string)[],"default_increment_kg"?: number | null,"equipment": (string)[],"id"?: string,"impact_lower_body"?: boolean | null,"is_main_lift"?: boolean | null,"long_length_bias"?: boolean | null,"main_lift_key"?: string | null,"mistakes"?: (string)[],"name": string,"owner_user_id"?: string | null,"pattern_id"?: string | null,"popularity"?: number,"slot_tags"?: (string)[],"slug": string,"substitutions"?: (string)[],"unilateral"?: boolean | null
                  }
                  Update: {
                    "axial_load"?: boolean | null,"category"?: string,"created_at"?: string | null,"cues"?: (string)[],"default_increment_kg"?: number | null,"equipment"?: (string)[],"id"?: string,"impact_lower_body"?: boolean | null,"is_main_lift"?: boolean | null,"long_length_bias"?: boolean | null,"main_lift_key"?: string | null,"mistakes"?: (string)[],"name"?: string,"owner_user_id"?: string | null,"pattern_id"?: string | null,"popularity"?: number,"slot_tags"?: (string)[],"slug"?: string,"substitutions"?: (string)[],"unilateral"?: boolean | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "exercises_pattern_id_fkey"
      columns: ["pattern_id"]
isOneToOne: false
      referencedRelation: "movement_patterns"
      referencedColumns: ["id"]
    }
                  ]
                },"injuries": {
                  Row: {
                    "avoid_exercise_ids": (string)[],"id": string,"label": string,"muscle_id": string | null,"rehab_note": string | null,"resolved_on": string | null,"severity": string,"started_on": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avoid_exercise_ids"?: (string)[],"id"?: string,"label": string,"muscle_id"?: string | null,"rehab_note"?: string | null,"resolved_on"?: string | null,"severity": string,"started_on": string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "avoid_exercise_ids"?: (string)[],"id"?: string,"label"?: string,"muscle_id"?: string | null,"rehab_note"?: string | null,"resolved_on"?: string | null,"severity"?: string,"started_on"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "injuries_muscle_id_fkey"
      columns: ["muscle_id"]
isOneToOne: false
      referencedRelation: "muscles"
      referencedColumns: ["id"]
    }
                  ]
                },"logged_sets": {
                  Row: {
                    "created_at": string | null,"exercise_id": string,"id": string,"is_warmup": boolean,"load_kg": number | null,"performed_on": string,"planned_exercise_id": string | null,"reps": number,"rir": number | null,"session_id": string | null,"set_index": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"exercise_id": string,"id"?: string,"is_warmup"?: boolean,"load_kg"?: number | null,"performed_on": string,"planned_exercise_id"?: string | null,"reps": number,"rir"?: number | null,"session_id"?: string | null,"set_index": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"exercise_id"?: string,"id"?: string,"is_warmup"?: boolean,"load_kg"?: number | null,"performed_on"?: string,"planned_exercise_id"?: string | null,"reps"?: number,"rir"?: number | null,"session_id"?: string | null,"set_index"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "logged_sets_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "logged_sets_planned_exercise_id_fkey"
      columns: ["planned_exercise_id"]
isOneToOne: false
      referencedRelation: "planned_exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "logged_sets_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "planned_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"movement_patterns": {
                  Row: {
                    "id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"name": string
                  }
                  Update: {
                    "id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"muscles": {
                  Row: {
                    "body_map_side": (string)[],"id": string,"name": string,"region": string,"tracked": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "body_map_side": (string)[],"id": string,"name": string,"region": string,"tracked"?: boolean
                  }
                  Update: {
                    "body_map_side"?: (string)[],"id"?: string,"name"?: string,"region"?: string,"tracked"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"nutrition_settings": {
                  Row: {
                    "activity_multiplier": number,"initial_adjust_done": boolean,"kcal_offset": number,"last_adjusted_on": string | null,"maintenance_kcal": number,"phase": string,"phase_history": NonNullable<Json>,"phase_started_on": string,"target_rate_pct": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_multiplier": number,"initial_adjust_done"?: boolean,"kcal_offset"?: number,"last_adjusted_on"?: string | null,"maintenance_kcal": number,"phase": string,"phase_history"?: NonNullable<Json>,"phase_started_on": string,"target_rate_pct": number,"user_id": string
                  }
                  Update: {
                    "activity_multiplier"?: number,"initial_adjust_done"?: boolean,"kcal_offset"?: number,"last_adjusted_on"?: string | null,"maintenance_kcal"?: number,"phase"?: string,"phase_history"?: NonNullable<Json>,"phase_started_on"?: string,"target_rate_pct"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"nutrition_targets": {
                  Row: {
                    "carbs_g": number,"carbs_min_g": number,"created_at": string | null,"effective_from": string,"fat_g": number,"fat_min_g": number,"id": string,"kcal": number,"kcal_high": number,"kcal_low": number,"maintenance_kcal": number | null,"protein_g": number,"reason": string,"sport_kcal_per_day": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "carbs_g": number,"carbs_min_g": number,"created_at"?: string | null,"effective_from": string,"fat_g": number,"fat_min_g": number,"id"?: string,"kcal": number,"kcal_high": number,"kcal_low": number,"maintenance_kcal"?: number | null,"protein_g": number,"reason": string,"sport_kcal_per_day"?: number,"user_id": string
                  }
                  Update: {
                    "carbs_g"?: number,"carbs_min_g"?: number,"created_at"?: string | null,"effective_from"?: string,"fat_g"?: number,"fat_min_g"?: number,"id"?: string,"kcal"?: number,"kcal_high"?: number,"kcal_low"?: number,"maintenance_kcal"?: number | null,"protein_g"?: number,"reason"?: string,"sport_kcal_per_day"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"planned_exercises": {
                  Row: {
                    "exercise_id": string,"id": string,"is_main_lift_single": boolean | null,"note": string | null,"position": number,"rep_max": number,"rep_min": number,"rest_seconds": number,"rir_max": number,"rir_min": number,"rule_ids": (string)[],"session_id": string,"sets": number,"skipped": boolean,"slot_key": string | null,"suggested_load_kg": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "exercise_id": string,"id"?: string,"is_main_lift_single"?: boolean | null,"note"?: string | null,"position": number,"rep_max": number,"rep_min": number,"rest_seconds": number,"rir_max": number,"rir_min": number,"rule_ids"?: (string)[],"session_id": string,"sets": number,"skipped"?: boolean,"slot_key"?: string | null,"suggested_load_kg"?: number | null,"user_id": string
                  }
                  Update: {
                    "exercise_id"?: string,"id"?: string,"is_main_lift_single"?: boolean | null,"note"?: string | null,"position"?: number,"rep_max"?: number,"rep_min"?: number,"rest_seconds"?: number,"rir_max"?: number,"rir_min"?: number,"rule_ids"?: (string)[],"session_id"?: string,"sets"?: number,"skipped"?: boolean,"slot_key"?: string | null,"suggested_load_kg"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "planned_exercises_exercise_id_fkey"
      columns: ["exercise_id"]
isOneToOne: false
      referencedRelation: "exercises"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "planned_exercises_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "planned_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"planned_sessions": {
                  Row: {
                    "block_id": string | null,"est_minutes": number | null,"finished_at": string | null,"id": string,"kind": string,"order_in_week": number,"scheduled_on": string,"started_at": string | null,"status": string,"template_key": string,"title": string,"user_id": string,"week_index": number
                  }
                  ComputedFields: never
                  Insert: {
                    "block_id"?: string | null,"est_minutes"?: number | null,"finished_at"?: string | null,"id"?: string,"kind"?: string,"order_in_week": number,"scheduled_on": string,"started_at"?: string | null,"status"?: string,"template_key": string,"title": string,"user_id": string,"week_index": number
                  }
                  Update: {
                    "block_id"?: string | null,"est_minutes"?: number | null,"finished_at"?: string | null,"id"?: string,"kind"?: string,"order_in_week"?: number,"scheduled_on"?: string,"started_at"?: string | null,"status"?: string,"template_key"?: string,"title"?: string,"user_id"?: string,"week_index"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "planned_sessions_block_id_fkey"
      columns: ["block_id"]
isOneToOne: false
      referencedRelation: "blocks"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "birth_year": number | null,"body_fat_pct": number | null,"bodyweight_kg": number | null,"created_at": string | null,"display_name": string | null,"email": string | null,"height_cm": number | null,"hide_bodyweight": boolean,"last_active_at": string | null,"onboarded_at": string | null,"role": string,"sex": string | null,"timezone": string,"units": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "birth_year"?: number | null,"body_fat_pct"?: number | null,"bodyweight_kg"?: number | null,"created_at"?: string | null,"display_name"?: string | null,"email"?: string | null,"height_cm"?: number | null,"hide_bodyweight"?: boolean,"last_active_at"?: string | null,"onboarded_at"?: string | null,"role"?: string,"sex"?: string | null,"timezone"?: string,"units"?: string,"user_id": string
                  }
                  Update: {
                    "birth_year"?: number | null,"body_fat_pct"?: number | null,"bodyweight_kg"?: number | null,"created_at"?: string | null,"display_name"?: string | null,"email"?: string | null,"height_cm"?: number | null,"hide_bodyweight"?: boolean,"last_active_at"?: string | null,"onboarded_at"?: string | null,"role"?: string,"sex"?: string | null,"timezone"?: string,"units"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"proposals": {
                  Row: {
                    "applies_from": string | null,"created_at": string | null,"decided_at": string | null,"expires_on": string | null,"id": string,"kind": string,"payload": NonNullable<Json>,"preview": Json | null,"rationale": string,"rule_ids": (string)[],"status": string,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applies_from"?: string | null,"created_at"?: string | null,"decided_at"?: string | null,"expires_on"?: string | null,"id"?: string,"kind": string,"payload": NonNullable<Json>,"preview"?: Json | null,"rationale": string,"rule_ids": (string)[],"status"?: string,"title": string,"user_id": string
                  }
                  Update: {
                    "applies_from"?: string | null,"created_at"?: string | null,"decided_at"?: string | null,"expires_on"?: string | null,"id"?: string,"kind"?: string,"payload"?: NonNullable<Json>,"preview"?: Json | null,"rationale"?: string,"rule_ids"?: (string)[],"status"?: string,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rule_sources": {
                  Row: {
                    "id": string,"page": string | null,"source": string,"summary": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"page"?: string | null,"source": string,"summary": string
                  }
                  Update: {
                    "id"?: string,"page"?: string | null,"source"?: string,"summary"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sport_logs": {
                  Row: {
                    "id": string,"minutes": number,"note": string | null,"performed_on": string,"session_rpe": number | null,"sport_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"minutes": number,"note"?: string | null,"performed_on": string,"session_rpe"?: number | null,"sport_id": string,"user_id": string
                  }
                  Update: {
                    "id"?: string,"minutes"?: number,"note"?: string | null,"performed_on"?: string,"session_rpe"?: number | null,"sport_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sport_logs_sport_id_fkey"
      columns: ["sport_id"]
isOneToOne: false
      referencedRelation: "sports"
      referencedColumns: ["id"]
    }
                  ]
                },"sports": {
                  Row: {
                    "conditioning": number,"default_minutes": number,"eccentric_impact": number,"id": string,"lower_body_load": number,"muscles_stressed": (string)[],"name": string,"notes": string | null,"owner_user_id": string | null,"upper_body_load": number
                  }
                  ComputedFields: never
                  Insert: {
                    "conditioning": number,"default_minutes": number,"eccentric_impact": number,"id": string,"lower_body_load": number,"muscles_stressed": (string)[],"name": string,"notes"?: string | null,"owner_user_id"?: string | null,"upper_body_load": number
                  }
                  Update: {
                    "conditioning"?: number,"default_minutes"?: number,"eccentric_impact"?: number,"id"?: string,"lower_body_load"?: number,"muscles_stressed"?: (string)[],"name"?: string,"notes"?: string | null,"owner_user_id"?: string | null,"upper_body_load"?: number
                  }
                  Relationships: [
                    
                  ]
                },"user_settings": {
                  Row: {
                    "available_days": (number)[],"disliked_exercise_ids": (string)[],"e1rm_seeds": NonNullable<Json>,"equipment": (string)[],"goal": string,"increments": NonNullable<Json>,"lifestyle": string,"max_lift_days": number | null,"priority": string,"rep_variation": string,"session_minutes": number,"specialization_muscles": (string)[],"split_style": string,"status_history": (string)[],"status_source": string,"strength_lifts": (string)[],"target_adjustments": NonNullable<Json>,"test_date": string | null,"trained_last_month": boolean,"training_status": string,"updated_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "available_days": (number)[],"disliked_exercise_ids"?: (string)[],"e1rm_seeds"?: NonNullable<Json>,"equipment"?: (string)[],"goal": string,"increments"?: NonNullable<Json>,"lifestyle"?: string,"max_lift_days"?: number | null,"priority"?: string,"rep_variation"?: string,"session_minutes"?: number,"specialization_muscles"?: (string)[],"split_style"?: string,"status_history"?: (string)[],"status_source"?: string,"strength_lifts"?: (string)[],"target_adjustments"?: NonNullable<Json>,"test_date"?: string | null,"trained_last_month"?: boolean,"training_status": string,"updated_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "available_days"?: (number)[],"disliked_exercise_ids"?: (string)[],"e1rm_seeds"?: NonNullable<Json>,"equipment"?: (string)[],"goal"?: string,"increments"?: NonNullable<Json>,"lifestyle"?: string,"max_lift_days"?: number | null,"priority"?: string,"rep_variation"?: string,"session_minutes"?: number,"specialization_muscles"?: (string)[],"split_style"?: string,"status_history"?: (string)[],"status_source"?: string,"strength_lifts"?: (string)[],"target_adjustments"?: NonNullable<Json>,"test_date"?: string | null,"trained_last_month"?: boolean,"training_status"?: string,"updated_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_sports": {
                  Row: {
                    "active": boolean,"created_at": string | null,"id": string,"intensity": string,"minutes": number,"sport_id": string,"time_of_day": string | null,"user_id": string,"weekdays": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string | null,"id"?: string,"intensity": string,"minutes": number,"sport_id": string,"time_of_day"?: string | null,"user_id": string,"weekdays": (number)[]
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string | null,"id"?: string,"intensity"?: string,"minutes"?: number,"sport_id"?: string,"time_of_day"?: string | null,"user_id"?: string,"weekdays"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_sports_sport_id_fkey"
      columns: ["sport_id"]
isOneToOne: false
      referencedRelation: "sports"
      referencedColumns: ["id"]
    }
                  ]
                },"weekly_reviews": {
                  Row: {
                    "aches_worse": boolean | null,"autofilled": NonNullable<Json>,"completed_at": string | null,"dreading_gym": boolean | null,"performance_down": boolean | null,"sleep_worse": boolean | null,"stress_worse": boolean | null,"user_id": string,"week_start": string,"yes_count": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aches_worse"?: boolean | null,"autofilled"?: NonNullable<Json>,"completed_at"?: string | null,"dreading_gym"?: boolean | null,"performance_down"?: boolean | null,"sleep_worse"?: boolean | null,"stress_worse"?: boolean | null,"user_id": string,"week_start": string,"yes_count"?: never
                  }
                  Update: {
                    "aches_worse"?: boolean | null,"autofilled"?: NonNullable<Json>,"completed_at"?: string | null,"dreading_gym"?: boolean | null,"performance_down"?: boolean | null,"sleep_worse"?: boolean | null,"stress_worse"?: boolean | null,"user_id"?: string,"week_start"?: string,"yes_count"?: never
                  }
                  Relationships: [
                    
                  ]
                },"weekly_targets": {
                  Row: {
                    "block_id": string,"muscle_id": string,"sport_trim": number,"target_sets": number,"user_id": string,"week_index": number
                  }
                  ComputedFields: never
                  Insert: {
                    "block_id": string,"muscle_id": string,"sport_trim"?: number,"target_sets": number,"user_id": string,"week_index": number
                  }
                  Update: {
                    "block_id"?: string,"muscle_id"?: string,"sport_trim"?: number,"target_sets"?: number,"user_id"?: string,"week_index"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "weekly_targets_block_id_fkey"
      columns: ["block_id"]
isOneToOne: false
      referencedRelation: "blocks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "weekly_targets_muscle_id_fkey"
      columns: ["muscle_id"]
isOneToOne: false
      referencedRelation: "muscles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_weekly_muscle_sets": {
                  Row: {
                    "muscle_id": string,"sets": number | null,"user_id": string,"week_start": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "exercise_muscles_muscle_id_fkey"
      columns: ["muscle_id"]
isOneToOne: false
      referencedRelation: "muscles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "admin_list_users":
{ Args: Record<PropertyKey, never>; Returns: {
              "display_name": string,"email": string,"joined": string,"last_active": string,"onboarded": boolean,"role": string,"user_id": string
            }[]
                           },
"admin_remove_user":
{ Args: { "p_email": string }; Returns: undefined
                           },
"delete_my_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"is_owner":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_role":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"replace_future_plan":
{ Args: { "p_block": Json,"p_from": string,"p_sessions": Json,"p_targets": Json }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
