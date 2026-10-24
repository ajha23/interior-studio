// Generated from the Supabase schema (project interior-studio). Regenerate after migrations.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type OrgRole = 'owner' | 'admin' | 'designer' | 'viewer';
type ProjectStatus = 'lead' | 'design' | 'approved' | 'production' | 'installed' | 'archived';
type VersionKind = 'autosave' | 'manual' | 'revision';

type VersionRow = {
  created_at: string;
  created_by: string | null;
  id: string;
  kind: VersionKind;
  message: string;
  org_id: string;
  project_id: string;
  scene: Json;
  scene_hash: string;
  schema_version: number;
  size_bytes: number | null;
  version_no: number;
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.18' };
  public: {
    Tables: {
      comments: {
        Row: {
          id: string
          org_id: string
          project_id: string
          parent_id: string | null
          anchor: Json | null
          body: string
          source: string
          author_id: string | null
          author_name: string
          share_link_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          created_at: string
          edited_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          project_id: string
          parent_id?: string | null
          anchor?: Json | null
          body: string
          source?: string
          author_id?: string | null
          author_name?: string
          share_link_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          created_at?: string
          edited_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          project_id?: string
          parent_id?: string | null
          anchor?: Json | null
          body?: string
          source?: string
          author_id?: string | null
          author_name?: string
          share_link_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          created_at?: string
          edited_at?: string | null
        }
        Relationships: []
      }
      ai_jobs: {
        Row: {
          id: string
          org_id: string
          project_id: string | null
          kind: string
          op: string
          status: string
          input: Json
          output_path: string | null
          render_id: string | null
          provider: string
          cost_credits: number
          error: string | null
          created_by: string
          created_at: string
          finished_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          project_id?: string | null
          kind: string
          op: string
          status?: string
          input?: Json
          output_path?: string | null
          render_id?: string | null
          provider: string
          cost_credits?: number
          error?: string | null
          created_by: string
          created_at?: string
          finished_at?: string | null
        }
        Update: {
          id?: string
          org_id?: string
          project_id?: string | null
          kind?: string
          op?: string
          status?: string
          input?: Json
          output_path?: string | null
          render_id?: string | null
          provider?: string
          cost_credits?: number
          error?: string | null
          created_by?: string
          created_at?: string
          finished_at?: string | null
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          org_id: string
          monthly_credits: number
          updated_at: string
        }
        Insert: {
          org_id: string
          monthly_credits?: number
          updated_at?: string
        }
        Update: {
          org_id?: string
          monthly_credits?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_credit_ledger: {
        Row: {
          id: number
          org_id: string
          delta: number
          reason: string
          period: string | null
          job_id: string | null
          note: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: number
          org_id: string
          delta: number
          reason: string
          period?: string | null
          job_id?: string | null
          note?: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          org_id?: string
          delta?: number
          reason?: string
          period?: string | null
          job_id?: string | null
          note?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      room_templates: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          org_id: string
          piece_count: number
          room_type: string
          style: string
          template: Json
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          name: string
          org_id: string
          piece_count?: number
          room_type?: string
          style?: string
          template: Json
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          org_id?: string
          piece_count?: number
          room_type?: string
          style?: string
          template?: Json
        }
        Relationships: []
      }
      renders: {
        Row: {
          created_at: string
          created_by: string
          engine: string
          caption: string
          height: number
          id: string
          kind: string
          mood: string
          org_id: string
          project_id: string
          samples: number
          storage_path: string
          version_no: number
          width: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          engine?: string
          caption?: string
          height: number
          id?: string
          kind?: string
          mood?: string
          org_id: string
          project_id: string
          samples?: number
          storage_path: string
          version_no?: number
          width: number
        }
        Update: {
          created_at?: string
          created_by?: string
          engine?: string
          caption?: string
          height?: number
          id?: string
          kind?: string
          mood?: string
          org_id?: string
          project_id?: string
          samples?: number
          storage_path?: string
          version_no?: number
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "renders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          allow_comments: boolean
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          label: string
          last_viewed_at: string | null
          org_id: string
          project_id: string
          revoked_at: string | null
          show_plan: boolean
          show_renders: boolean
          token: string
          version_id: string | null
          view_count: number
        }
        Insert: {
          allow_comments?: boolean
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          label?: string
          last_viewed_at?: string | null
          org_id: string
          project_id: string
          revoked_at?: string | null
          show_plan?: boolean
          show_renders?: boolean
          token?: string
          version_id?: string | null
          view_count?: number
        }
        Update: {
          allow_comments?: boolean
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          label?: string
          last_viewed_at?: string | null
          org_id?: string
          project_id?: string
          revoked_at?: string | null
          show_plan?: boolean
          show_renders?: boolean
          token?: string
          version_id?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "share_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "project_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_models: {
        Row: {
          bytes: number
          category: string
          created_at: string
          created_by: string
          source_format: string
          depth_um: number
          height_um: number
          id: string
          name: string
          org_id: string
          recipe: Json | null
          storage_path: string
          thumb_path: string | null
          width_um: number
        }
        Insert: {
          bytes?: number
          category?: string
          created_at?: string
          created_by?: string
          source_format?: string
          depth_um: number
          height_um: number
          id?: string
          name: string
          org_id: string
          recipe?: Json | null
          storage_path: string
          thumb_path?: string | null
          width_um: number
        }
        Update: {
          bytes?: number
          category?: string
          created_at?: string
          created_by?: string
          source_format?: string
          depth_um?: number
          height_um?: number
          id?: string
          name?: string
          org_id?: string
          recipe?: Json | null
          storage_path?: string
          thumb_path?: string | null
          width_um?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_models_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: { accepted_at: string | null; created_at: string; email: string; id: string; invited_by: string | null; org_id: string; role: OrgRole };
        Insert: { accepted_at?: string | null; created_at?: string; email: string; id?: string; invited_by?: string | null; org_id: string; role?: OrgRole };
        Update: { accepted_at?: string | null; created_at?: string; email?: string; id?: string; invited_by?: string | null; org_id?: string; role?: OrgRole };
        Relationships: [];
      };
      org_members: {
        Row: { created_at: string; org_id: string; role: OrgRole; user_id: string };
        Insert: { created_at?: string; org_id: string; role?: OrgRole; user_id: string };
        Update: { created_at?: string; org_id?: string; role?: OrgRole; user_id?: string };
        Relationships: [
          { foreignKeyName: 'org_members_org_id_fkey'; columns: ['org_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'org_members_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      organizations: {
        Row: { created_at: string; id: string; name: string; plan: string; slug: string };
        Insert: { created_at?: string; id?: string; name: string; plan?: string; slug: string };
        Update: { created_at?: string; id?: string; name?: string; plan?: string; slug?: string };
        Relationships: [];
      };
      profiles: {
        Row: { avatar_url: string | null; created_at: string; email: string; full_name: string | null; id: string };
        Insert: { avatar_url?: string | null; created_at?: string; email: string; full_name?: string | null; id: string };
        Update: { avatar_url?: string | null; created_at?: string; email?: string; full_name?: string | null; id?: string };
        Relationships: [];
      };
      project_versions: {
        Row: VersionRow;
        Insert: Partial<VersionRow> & { org_id: string; project_id: string; scene: Json; scene_hash: string; schema_version: number; version_no: number };
        Update: Partial<VersionRow>;
        Relationships: [
          { foreignKeyName: 'project_versions_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      price_lists: {
        Row: { org_id: string; rates: Json; updated_at: string; updated_by: string | null };
        Insert: { org_id: string; rates: Json; updated_at?: string; updated_by?: string | null };
        Update: { org_id?: string; rates?: Json; updated_at?: string; updated_by?: string | null };
        Relationships: [];
      };
      quotes: {
        Row: { id: string; org_id: string; project_id: string; quote_no: string; version_no: number; status: string; client_name: string; lines: Json; totals: Json; rates: Json; notes: string; created_at: string; created_by: string | null };
        Insert: { id?: string; org_id: string; project_id: string; quote_no: string; version_no?: number; status?: string; client_name?: string; lines: Json; totals: Json; rates: Json; notes?: string; created_at?: string; created_by?: string | null };
        Update: { status?: string; notes?: string; client_name?: string };
        Relationships: [];
      };
      projects: {
        Row: {
          archived_at: string | null;
          client_name: string;
          created_at: string;
          created_by: string | null;
          current_version_id: string | null;
          current_version_no: number;
          id: string;
          name: string;
          org_id: string;
          site_address: string;
          status: ProjectStatus;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          archived_at?: string | null;
          client_name?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          org_id: string;
          site_address?: string;
          status?: ProjectStatus;
        };
        Update: {
          archived_at?: string | null;
          client_name?: string;
          name?: string;
          site_address?: string;
          status?: ProjectStatus;
        };
        Relationships: [
          { foreignKeyName: 'projects_updated_by_fkey'; columns: ['updated_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_pending_invites: { Args: never; Returns: number };
      ai_credit_balance: { Args: { p_org: string }; Returns: number };
      save_project_version: {
        Args: {
          p_kind?: VersionKind;
          p_message?: string;
          p_project: string;
          p_scene: Json;
          p_scene_hash: string;
          p_schema_version: number;
        };
        Returns: VersionRow;
      };
    };
    Enums: { org_role: OrgRole; project_status: ProjectStatus; version_kind: VersionKind };
    CompositeTypes: { [_ in never]: never };
  };
};

export type OrgRoleT = OrgRole;
export type ProjectStatusT = ProjectStatus;
export type VersionKindT = VersionKind;
export type ProjectRow = Database['public']['Tables']['projects']['Row'];
export type ProjectVersionRow = VersionRow;
export type RenderRow = Database['public']['Tables']['renders']['Row'];
export type ShareLinkRow = Database['public']['Tables']['share_links']['Row'];
