
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_credit_ledger": {
                  Row: {
                    "created_at": string,"created_by": string | null,"delta": number,"id": number,"job_id": string | null,"note": string,"org_id": string,"period": string | null,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"delta": number,"id"?: never,"job_id"?: string | null,"note"?: string,"org_id": string,"period"?: string | null,"reason": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"delta"?: number,"id"?: never,"job_id"?: string | null,"note"?: string,"org_id"?: string,"period"?: string | null,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_credit_ledger_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "ai_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_credit_ledger_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_jobs": {
                  Row: {
                    "cost_credits": number,"created_at": string,"created_by": string,"error": string | null,"finished_at": string | null,"id": string,"input": NonNullable<Json>,"kind": string,"op": string,"org_id": string,"output_path": string | null,"project_id": string | null,"provider": string,"render_id": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_credits"?: number,"created_at"?: string,"created_by": string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"input"?: NonNullable<Json>,"kind": string,"op": string,"org_id": string,"output_path"?: string | null,"project_id"?: string | null,"provider": string,"render_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "cost_credits"?: number,"created_at"?: string,"created_by"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"input"?: NonNullable<Json>,"kind"?: string,"op"?: string,"org_id"?: string,"output_path"?: string | null,"project_id"?: string | null,"provider"?: string,"render_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_jobs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_jobs_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_jobs_render_id_fkey"
      columns: ["render_id"]
isOneToOne: false
      referencedRelation: "renders"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_settings": {
                  Row: {
                    "monthly_credits": number,"org_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "monthly_credits"?: number,"org_id": string,"updated_at"?: string
                  }
                  Update: {
                    "monthly_credits"?: number,"org_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_settings_org_id_fkey"
      columns: ["org_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_models": {
                  Row: {
                    "bytes": number,"category": string,"created_at": string,"created_by": string,"depth_um": number,"height_um": number,"id": string,"name": string,"org_id": string,"recipe": Json | null,"source_format": string,"storage_path": string,"thumb_path": string | null,"width_um": number
                  }
                  ComputedFields: never
                  Insert: {
                    "bytes"?: number,"category"?: string,"created_at"?: string,"created_by"?: string,"depth_um": number,"height_um": number,"id"?: string,"name": string,"org_id": string,"recipe"?: Json | null,"source_format"?: string,"storage_path": string,"thumb_path"?: string | null,"width_um": number
                  }
                  Update: {
                    "bytes"?: number,"category"?: string,"created_at"?: string,"created_by"?: string,"depth_um"?: number,"height_um"?: number,"id"?: string,"name"?: string,"org_id"?: string,"recipe"?: Json | null,"source_format"?: string,"storage_path"?: string,"thumb_path"?: string | null,"width_um"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_models_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "anchor": Json | null,"author_id": string | null,"author_name": string,"body": string,"created_at": string,"edited_at": string | null,"id": string,"org_id": string,"parent_id": string | null,"project_id": string,"resolved_at": string | null,"resolved_by": string | null,"share_link_id": string | null,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anchor"?: Json | null,"author_id"?: string | null,"author_name"?: string,"body": string,"created_at"?: string,"edited_at"?: string | null,"id"?: string,"org_id": string,"parent_id"?: string | null,"project_id": string,"resolved_at"?: string | null,"resolved_by"?: string | null,"share_link_id"?: string | null,"source"?: string
                  }
                  Update: {
                    "anchor"?: Json | null,"author_id"?: string | null,"author_name"?: string,"body"?: string,"created_at"?: string,"edited_at"?: string | null,"id"?: string,"org_id"?: string,"parent_id"?: string | null,"project_id"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"share_link_id"?: string | null,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_share_link_id_fkey"
      columns: ["share_link_id"]
isOneToOne: false
      referencedRelation: "share_links"
      referencedColumns: ["id"]
    }
                  ]
                },"org_invites": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"email": string,"id": string,"invited_by": string | null,"org_id": string,"role": Database["public"]['Enums']["org_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"email": string,"id"?: string,"invited_by"?: string | null,"org_id": string,"role"?: Database["public"]['Enums']["org_role"]
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"invited_by"?: string | null,"org_id"?: string,"role"?: Database["public"]['Enums']["org_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_invites_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_invites_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"org_members": {
                  Row: {
                    "created_at": string,"org_id": string,"role": Database["public"]['Enums']["org_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"org_id": string,"role"?: Database["public"]['Enums']["org_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"org_id"?: string,"role"?: Database["public"]['Enums']["org_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"last_active_at": string,"name": string,"plan": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_active_at"?: string,"name": string,"plan"?: string,"slug": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_active_at"?: string,"name"?: string,"plan"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"price_lists": {
                  Row: {
                    "org_id": string,"rates": NonNullable<Json>,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "org_id": string,"rates": NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "org_id"?: string,"rates"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_lists_org_id_fkey"
      columns: ["org_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"email": string,"full_name": string | null,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"email": string,"full_name"?: string | null,"id": string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"project_versions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"doc_type": Database["public"]['Enums']["doc_type"],"id": string,"kind": Database["public"]['Enums']["version_kind"],"message": string,"org_id": string,"project_id": string,"scene": NonNullable<Json>,"scene_hash": string,"schema_version": number,"size_bytes": number | null,"version_no": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"doc_type": Database["public"]['Enums']["doc_type"],"id"?: string,"kind"?: Database["public"]['Enums']["version_kind"],"message"?: string,"org_id": string,"project_id": string,"scene": NonNullable<Json>,"scene_hash": string,"schema_version": number,"size_bytes"?: never,"version_no": number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"doc_type"?: Database["public"]['Enums']["doc_type"],"id"?: string,"kind"?: Database["public"]['Enums']["version_kind"],"message"?: string,"org_id"?: string,"project_id"?: string,"scene"?: NonNullable<Json>,"scene_hash"?: string,"schema_version"?: number,"size_bytes"?: never,"version_no"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_versions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_versions_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_versions_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "archived_at": string | null,"client_name": string,"created_at": string,"created_by": string | null,"current_version_id": string | null,"current_version_no": number,"id": string,"name": string,"org_id": string,"site_address": string,"status": Database["public"]['Enums']["project_status"],"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"client_name"?: string,"created_at"?: string,"created_by"?: string | null,"current_version_id"?: string | null,"current_version_no"?: number,"id"?: string,"name": string,"org_id": string,"site_address"?: string,"status"?: Database["public"]['Enums']["project_status"],"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"client_name"?: string,"created_at"?: string,"created_by"?: string | null,"current_version_id"?: string | null,"current_version_no"?: number,"id"?: string,"name"?: string,"org_id"?: string,"site_address"?: string,"status"?: Database["public"]['Enums']["project_status"],"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_current_version_fk"
      columns: ["current_version_id"]
isOneToOne: false
      referencedRelation: "project_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"quotes": {
                  Row: {
                    "client_name": string,"created_at": string,"created_by": string | null,"id": string,"lines": NonNullable<Json>,"notes": string,"org_id": string,"project_id": string,"quote_no": string,"rates": NonNullable<Json>,"status": string,"totals": NonNullable<Json>,"version_no": number
                  }
                  ComputedFields: never
                  Insert: {
                    "client_name"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"lines": NonNullable<Json>,"notes"?: string,"org_id": string,"project_id": string,"quote_no": string,"rates": NonNullable<Json>,"status"?: string,"totals": NonNullable<Json>,"version_no"?: number
                  }
                  Update: {
                    "client_name"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"lines"?: NonNullable<Json>,"notes"?: string,"org_id"?: string,"project_id"?: string,"quote_no"?: string,"rates"?: NonNullable<Json>,"status"?: string,"totals"?: NonNullable<Json>,"version_no"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"renders": {
                  Row: {
                    "caption": string,"created_at": string,"created_by": string,"engine": string,"height": number,"id": string,"kind": string,"mood": string,"org_id": string,"project_id": string,"samples": number,"storage_path": string,"version_no": number,"width": number
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string,"created_at"?: string,"created_by"?: string,"engine"?: string,"height": number,"id"?: string,"kind"?: string,"mood"?: string,"org_id": string,"project_id": string,"samples"?: number,"storage_path": string,"version_no"?: number,"width": number
                  }
                  Update: {
                    "caption"?: string,"created_at"?: string,"created_by"?: string,"engine"?: string,"height"?: number,"id"?: string,"kind"?: string,"mood"?: string,"org_id"?: string,"project_id"?: string,"samples"?: number,"storage_path"?: string,"version_no"?: number,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "renders_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "renders_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"room_templates": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"name": string,"org_id": string,"piece_count": number,"room_type": string,"style": string,"template": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"name": string,"org_id": string,"piece_count"?: number,"room_type"?: string,"style"?: string,"template": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"name"?: string,"org_id"?: string,"piece_count"?: number,"room_type"?: string,"style"?: string,"template"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_templates_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"share_links": {
                  Row: {
                    "allow_comments": boolean,"created_at": string,"created_by": string,"expires_at": string | null,"id": string,"label": string,"last_viewed_at": string | null,"org_id": string,"project_id": string,"revoked_at": string | null,"show_plan": boolean,"show_renders": boolean,"token": string,"version_id": string | null,"view_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_comments"?: boolean,"created_at"?: string,"created_by"?: string,"expires_at"?: string | null,"id"?: string,"label"?: string,"last_viewed_at"?: string | null,"org_id": string,"project_id": string,"revoked_at"?: string | null,"show_plan"?: boolean,"show_renders"?: boolean,"token"?: string,"version_id"?: string | null,"view_count"?: number
                  }
                  Update: {
                    "allow_comments"?: boolean,"created_at"?: string,"created_by"?: string,"expires_at"?: string | null,"id"?: string,"label"?: string,"last_viewed_at"?: string | null,"org_id"?: string,"project_id"?: string,"revoked_at"?: string | null,"show_plan"?: boolean,"show_renders"?: boolean,"token"?: string,"version_id"?: string | null,"view_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "share_links_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "share_links_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "share_links_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "project_versions"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_pending_invites":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"ai_credit_balance":
{ Args: { "p_org": string }; Returns: number
                           },
"ai_finish_call":
{ Args: { "p_error"?: string,"p_finish_token": string,"p_job": string,"p_ok": boolean,"p_provider"?: string }; Returns: string
                           },
"ai_start_call":
{ Args: { "p_op": string,"p_org": string }; Returns: Json
                           },
"create_project":
{ Args: { "p_client_name"?: string,"p_doc_type": Database["public"]['Enums']["doc_type"],"p_idempotency_key": string,"p_name": string,"p_org": string,"p_scene": Json,"p_schema_version": number }; Returns: {
              "client_name": string,"created_at": string,"created_by": string,"current_version_no": number,"id": string,"name": string,"org_id": string,"updated_at": string
            }[]
                           },
"save_project_version":
{ Args: { "p_doc_type": Database["public"]['Enums']["doc_type"],"p_expected_version_no": number,"p_idempotency_key": string,"p_kind"?: Database["public"]['Enums']["version_kind"],"p_message"?: string,"p_project": string,"p_scene": Json,"p_schema_version": number }; Returns: {
              "created_at": string,"created_by": string,"id": string,"kind": Database["public"]['Enums']["version_kind"],"message": string,"project_id": string,"scene_hash": string,"size_bytes": number,"version_no": number
            }[]
                           },
"start_session":
{ Args: Record<PropertyKey, never>; Returns: number
                           }
          }
          Enums: {
            "doc_type": "kitchen"|"home"|"legacy_v1","org_role": "owner"|"admin"|"designer"|"viewer","project_status": "lead"|"design"|"approved"|"production"|"installed"|"archived","version_kind": "autosave"|"manual"|"revision"|"restore"
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
  "public": {
          Enums: {
            "doc_type": ["kitchen", "home", "legacy_v1"],"org_role": ["owner", "admin", "designer", "viewer"],"project_status": ["lead", "design", "approved", "production", "installed", "archived"],"version_kind": ["autosave", "manual", "revision", "restore"]
          }
        }
} as const
