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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      allowed_signup_domains: {
        Row: {
          apex_domain: string
          created_datetime_utc: string
          id: number
        }
        Insert: {
          apex_domain: string
          created_datetime_utc?: string
          id?: number
        }
        Update: {
          apex_domain?: string
          created_datetime_utc?: string
          id?: number
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          created_datetime_utc: string
          id: number
          message: string | null
          modified_datetime_utc: string | null
          profile_id: string | null
          subject: string | null
        }
        Insert: {
          created_datetime_utc?: string
          id?: number
          message?: string | null
          modified_datetime_utc?: string | null
          profile_id?: string | null
          subject?: string | null
        }
        Update: {
          created_datetime_utc?: string
          id?: number
          message?: string | null
          modified_datetime_utc?: string | null
          profile_id?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caption_examples: {
        Row: {
          caption: string
          created_datetime_utc: string
          explanation: string
          id: number
          image_description: string
          image_id: string | null
          modified_datetime_utc: string | null
          priority: number
        }
        Insert: {
          caption: string
          created_datetime_utc?: string
          explanation: string
          id?: number
          image_description: string
          image_id?: string | null
          modified_datetime_utc?: string | null
          priority?: number
        }
        Update: {
          caption?: string
          created_datetime_utc?: string
          explanation?: string
          id?: number
          image_description?: string
          image_id?: string | null
          modified_datetime_utc?: string | null
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "caption_examples_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      caption_likes: {
        Row: {
          caption_id: string
          created_datetime_utc: string
          id: number
          modified_datetime_utc: string | null
          profile_id: string
        }
        Insert: {
          caption_id: string
          created_datetime_utc?: string
          id?: number
          modified_datetime_utc?: string | null
          profile_id: string
        }
        Update: {
          caption_id?: string
          created_datetime_utc?: string
          id?: number
          modified_datetime_utc?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "caption_likes_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "captions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caption_likes_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "v_richest_image_dedup"
            referencedColumns: ["caption_id"]
          },
          {
            foreignKeyName: "caption_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caption_requests: {
        Row: {
          created_datetime_utc: string
          id: number
          image_id: string
          profile_id: string
        }
        Insert: {
          created_datetime_utc?: string
          id?: number
          image_id: string
          profile_id: string
        }
        Update: {
          created_datetime_utc?: string
          id?: number
          image_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "caption_requests_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caption_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caption_saved: {
        Row: {
          caption_id: string
          created_datetime_utc: string
          id: number
          modified_datetime_utc: string | null
          profile_id: string
        }
        Insert: {
          caption_id: string
          created_datetime_utc?: string
          id?: number
          modified_datetime_utc?: string | null
          profile_id: string
        }
        Update: {
          caption_id?: string
          created_datetime_utc?: string
          id?: number
          modified_datetime_utc?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "caption_saved_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "captions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caption_saved_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "v_richest_image_dedup"
            referencedColumns: ["caption_id"]
          },
          {
            foreignKeyName: "caption_saved_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caption_votes: {
        Row: {
          caption_id: string
          created_datetime_utc: string
          id: number
          modified_datetime_utc: string | null
          profile_id: string
          vote_value: number
        }
        Insert: {
          caption_id: string
          created_datetime_utc: string
          id?: number
          modified_datetime_utc?: string | null
          profile_id: string
          vote_value: number
        }
        Update: {
          caption_id?: string
          created_datetime_utc?: string
          id?: number
          modified_datetime_utc?: string | null
          profile_id?: string
          vote_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "caption_votes_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "captions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caption_votes_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "v_richest_image_dedup"
            referencedColumns: ["caption_id"]
          },
          {
            foreignKeyName: "caption_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      captions: {
        Row: {
          caption_request_id: number | null
          content: string | null
          created_datetime_utc: string
          humor_flavor_id: number | null
          id: string
          image_id: string
          is_featured: boolean
          is_public: boolean
          like_count: number
          llm_prompt_chain_id: number | null
          modified_datetime_utc: string | null
          profile_id: string
        }
        Insert: {
          caption_request_id?: number | null
          content?: string | null
          created_datetime_utc?: string
          humor_flavor_id?: number | null
          id?: string
          image_id: string
          is_featured?: boolean
          is_public: boolean
          like_count?: number
          llm_prompt_chain_id?: number | null
          modified_datetime_utc?: string | null
          profile_id: string
        }
        Update: {
          caption_request_id?: number | null
          content?: string | null
          created_datetime_utc?: string
          humor_flavor_id?: number | null
          id?: string
          image_id?: string
          is_featured?: boolean
          is_public?: boolean
          like_count?: number
          llm_prompt_chain_id?: number | null
          modified_datetime_utc?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "captions_caption_request_id_fkey"
            columns: ["caption_request_id"]
            isOneToOne: false
            referencedRelation: "caption_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captions_humor_flavor_id_fkey"
            columns: ["humor_flavor_id"]
            isOneToOne: false
            referencedRelation: "humor_flavors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captions_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captions_llm_prompt_chain_id_fkey"
            columns: ["llm_prompt_chain_id"]
            isOneToOne: false
            referencedRelation: "llm_prompt_chains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      common_use_categories: {
        Row: {
          created_datetime_utc: string
          id: number
          modified_datetime_utc: string | null
          name: string | null
        }
        Insert: {
          created_datetime_utc?: string
          id?: number
          modified_datetime_utc?: string | null
          name?: string | null
        }
        Update: {
          created_datetime_utc?: string
          id?: number
          modified_datetime_utc?: string | null
          name?: string | null
        }
        Relationships: []
      }
      common_use_category_image_mappings: {
        Row: {
          common_use_category_id: number | null
          created_datetime_utc: string
          id: number
          image_id: string | null
          modified_datetime_utc: string | null
        }
        Insert: {
          common_use_category_id?: number | null
          created_datetime_utc?: string
          id?: number
          image_id?: string | null
          modified_datetime_utc?: string | null
        }
        Update: {
          common_use_category_id?: number | null
          created_datetime_utc?: string
          id?: number
          image_id?: string | null
          modified_datetime_utc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "common_use_category_image_mappings_common_use_category_id_fkey"
            columns: ["common_use_category_id"]
            isOneToOne: false
            referencedRelation: "common_use_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "common_use_category_image_mappings_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          created_datetime_utc: string
          id: number
          modified_datetime_utc: string | null
          name: string | null
        }
        Insert: {
          created_datetime_utc?: string
          id?: number
          modified_datetime_utc?: string | null
          name?: string | null
        }
        Update: {
          created_datetime_utc?: string
          id?: number
          modified_datetime_utc?: string | null
          name?: string | null
        }
        Relationships: []
      }
      community_context_tag_mappings: {
        Row: {
          community_context_id: number
          community_context_tag_id: number
          created_datetime_utc: string
          id: number
        }
        Insert: {
          community_context_id: number
          community_context_tag_id: number
          created_datetime_utc?: string
          id?: number
        }
        Update: {
          community_context_id?: number
          community_context_tag_id?: number
          created_datetime_utc?: string
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_context_tag_mappings_community_context_id_fkey"
            columns: ["community_context_id"]
            isOneToOne: false
            referencedRelation: "community_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_context_tag_mappings_community_context_tag_id_fkey"
            columns: ["community_context_tag_id"]
            isOneToOne: false
            referencedRelation: "community_context_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      community_context_tags: {
        Row: {
          created_datetime_utc: string
          id: number
          name: string
        }
        Insert: {
          created_datetime_utc?: string
          id?: number
          name: string
        }
        Update: {
          created_datetime_utc?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      community_contexts: {
        Row: {
          community_id: number | null
          content: string | null
          created_datetime_utc: string
          embedding: string | null
          end_datetime_utc: string | null
          id: number
          modified_datetime_utc: string | null
          priority: number | null
          start_datetime_utc: string | null
        }
        Insert: {
          community_id?: number | null
          content?: string | null
          created_datetime_utc?: string
          embedding?: string | null
          end_datetime_utc?: string | null
          id?: number
          modified_datetime_utc?: string | null
          priority?: number | null
          start_datetime_utc?: string | null
        }
        Update: {
          community_id?: number | null
          content?: string | null
          created_datetime_utc?: string
          embedding?: string | null
          end_datetime_utc?: string | null
          id?: number
          modified_datetime_utc?: string | null
          priority?: number | null
          start_datetime_utc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_contexts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      dorms: {
        Row: {
          created_at: string | null
          full_name: string
          id: number
          short_name: string
          university_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          full_name: string
          id?: number
          short_name: string
          university_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string
          id?: number
          short_name?: string
          university_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dorms_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      humor_flavor_mix: {
        Row: {
          caption_count: number
          created_datetime_utc: string
          humor_flavor_id: number
          id: number
        }
        Insert: {
          caption_count: number
          created_datetime_utc?: string
          humor_flavor_id: number
          id?: number
        }
        Update: {
          caption_count?: number
          created_datetime_utc?: string
          humor_flavor_id?: number
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "humor_flavor_mix_humor_flavor_id_fkey"
            columns: ["humor_flavor_id"]
            isOneToOne: false
            referencedRelation: "humor_flavors"
            referencedColumns: ["id"]
          },
        ]
      }
      humor_flavor_step_types: {
        Row: {
          created_at: string
          description: string
          id: number
          slug: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: number
          slug: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: number
          slug?: string
        }
        Relationships: []
      }
      humor_flavor_steps: {
        Row: {
          created_datetime_utc: string
          description: string | null
          humor_flavor_id: number
          humor_flavor_step_type_id: number
          id: number
          llm_input_type_id: number
          llm_model_id: number
          llm_output_type_id: number
          llm_system_prompt: string | null
          llm_temperature: number | null
          llm_user_prompt: string | null
          order_by: number
        }
        Insert: {
          created_datetime_utc?: string
          description?: string | null
          humor_flavor_id: number
          humor_flavor_step_type_id: number
          id?: number
          llm_input_type_id: number
          llm_model_id: number
          llm_output_type_id: number
          llm_system_prompt?: string | null
          llm_temperature?: number | null
          llm_user_prompt?: string | null
          order_by: number
        }
        Update: {
          created_datetime_utc?: string
          description?: string | null
          humor_flavor_id?: number
          humor_flavor_step_type_id?: number
          id?: number
          llm_input_type_id?: number
          llm_model_id?: number
          llm_output_type_id?: number
          llm_system_prompt?: string | null
          llm_temperature?: number | null
          llm_user_prompt?: string | null
          order_by?: number
        }
        Relationships: [
          {
            foreignKeyName: "humor_flavor_steps_humor_flavor_id_fkey"
            columns: ["humor_flavor_id"]
            isOneToOne: false
            referencedRelation: "humor_flavors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "humor_flavor_steps_humor_flavor_step_id_fkey"
            columns: ["humor_flavor_step_type_id"]
            isOneToOne: false
            referencedRelation: "humor_flavor_step_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "humor_flavor_steps_llm_input_type_id_fkey"
            columns: ["llm_input_type_id"]
            isOneToOne: false
            referencedRelation: "llm_input_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "humor_flavor_steps_llm_model_id_fkey"
            columns: ["llm_model_id"]
            isOneToOne: false
            referencedRelation: "llm_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "humor_flavor_steps_llm_output_type_id_fkey"
            columns: ["llm_output_type_id"]
            isOneToOne: false
            referencedRelation: "llm_output_types"
            referencedColumns: ["id"]
          },
        ]
      }
      humor_flavor_theme_mappings: {
        Row: {
          created_datetime_utc: string
          humor_flavor_id: number | null
          humor_theme_id: number | null
          id: number
        }
        Insert: {
          created_datetime_utc?: string
          humor_flavor_id?: number | null
          humor_theme_id?: number | null
          id?: number
        }
        Update: {
          created_datetime_utc?: string
          humor_flavor_id?: number | null
          humor_theme_id?: number | null
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "humor_flavor_theme_mappings_humor_flavor_id_fkey"
            columns: ["humor_flavor_id"]
            isOneToOne: false
            referencedRelation: "humor_flavors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "humor_flavor_theme_mappings_humor_theme_id_fkey"
            columns: ["humor_theme_id"]
            isOneToOne: false
            referencedRelation: "humor_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      humor_flavors: {
        Row: {
          created_datetime_utc: string
          description: string | null
          id: number
          slug: string
        }
        Insert: {
          created_datetime_utc?: string
          description?: string | null
          id?: number
          slug: string
        }
        Update: {
          created_datetime_utc?: string
          description?: string | null
          id?: number
          slug?: string
        }
        Relationships: []
      }
      humor_themes: {
        Row: {
          created_datetime_utc: string
          description: string | null
          id: number
          name: string | null
        }
        Insert: {
          created_datetime_utc?: string
          description?: string | null
          id?: number
          name?: string | null
        }
        Update: {
          created_datetime_utc?: string
          description?: string | null
          id?: number
          name?: string | null
        }
        Relationships: []
      }
      images: {
        Row: {
          additional_context: string | null
          celebrity_recognition: string | null
          created_datetime_utc: string
          embedding: string | null
          id: string
          image_description: string | null
          is_common_use: boolean | null
          is_public: boolean | null
          modified_datetime_utc: string | null
          profile_id: string | null
          url: string | null
        }
        Insert: {
          additional_context?: string | null
          celebrity_recognition?: string | null
          created_datetime_utc?: string
          embedding?: string | null
          id?: string
          image_description?: string | null
          is_common_use?: boolean | null
          is_public?: boolean | null
          modified_datetime_utc?: string | null
          profile_id?: string | null
          url?: string | null
        }
        Update: {
          additional_context?: string | null
          celebrity_recognition?: string | null
          created_datetime_utc?: string
          embedding?: string | null
          id?: string
          image_description?: string | null
          is_common_use?: boolean | null
          is_public?: boolean | null
          modified_datetime_utc?: string | null
          profile_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "images_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          created_datetime_utc: string | null
          expires_datetime_utc: string | null
          id: number
          invitation_token: string
          invitee_email: string
          inviter_id: string | null
          is_accepted: boolean | null
        }
        Insert: {
          created_datetime_utc?: string | null
          expires_datetime_utc?: string | null
          id?: number
          invitation_token: string
          invitee_email: string
          inviter_id?: string | null
          is_accepted?: boolean | null
        }
        Update: {
          created_datetime_utc?: string | null
          expires_datetime_utc?: string | null
          id?: number
          invitation_token?: string
          invitee_email?: string
          inviter_id?: string | null
          is_accepted?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      link_redirects: {
        Row: {
          created_datetime_utc: string
          destination_url: string
          folder_path: string | null
          id: number
          modified_datetime_utc: string | null
          name: string
          slug: string
          visit_count: number
        }
        Insert: {
          created_datetime_utc?: string
          destination_url: string
          folder_path?: string | null
          id?: number
          modified_datetime_utc?: string | null
          name: string
          slug: string
          visit_count?: number
        }
        Update: {
          created_datetime_utc?: string
          destination_url?: string
          folder_path?: string | null
          id?: number
          modified_datetime_utc?: string | null
          name?: string
          slug?: string
          visit_count?: number
        }
        Relationships: []
      }
      llm_input_types: {
        Row: {
          created_datetime_utc: string
          description: string
          id: number
          slug: string
        }
        Insert: {
          created_datetime_utc?: string
          description: string
          id?: number
          slug: string
        }
        Update: {
          created_datetime_utc?: string
          description?: string
          id?: number
          slug?: string
        }
        Relationships: []
      }
      llm_model_responses: {
        Row: {
          caption_request_id: number
          created_datetime_utc: string
          humor_flavor_id: number
          humor_flavor_step_id: number | null
          id: string
          llm_model_id: number
          llm_model_response: string | null
          llm_prompt_chain_id: number | null
          llm_system_prompt: string
          llm_temperature: number | null
          llm_user_prompt: string
          processing_time_seconds: number
          profile_id: string
        }
        Insert: {
          caption_request_id: number
          created_datetime_utc?: string
          humor_flavor_id: number
          humor_flavor_step_id?: number | null
          id?: string
          llm_model_id: number
          llm_model_response?: string | null
          llm_prompt_chain_id?: number | null
          llm_system_prompt: string
          llm_temperature?: number | null
          llm_user_prompt: string
          processing_time_seconds: number
          profile_id: string
        }
        Update: {
          caption_request_id?: number
          created_datetime_utc?: string
          humor_flavor_id?: number
          humor_flavor_step_id?: number | null
          id?: string
          llm_model_id?: number
          llm_model_response?: string | null
          llm_prompt_chain_id?: number | null
          llm_system_prompt?: string
          llm_temperature?: number | null
          llm_user_prompt?: string
          processing_time_seconds?: number
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_model_responses_caption_request_id_fkey"
            columns: ["caption_request_id"]
            isOneToOne: false
            referencedRelation: "caption_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_model_responses_humor_flavor_id_fkey"
            columns: ["humor_flavor_id"]
            isOneToOne: false
            referencedRelation: "humor_flavors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_model_responses_humor_flavor_step_id_fkey"
            columns: ["humor_flavor_step_id"]
            isOneToOne: false
            referencedRelation: "humor_flavor_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_model_responses_llm_model_id_fkey"
            columns: ["llm_model_id"]
            isOneToOne: false
            referencedRelation: "llm_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_model_responses_llm_prompt_chain_id_fkey"
            columns: ["llm_prompt_chain_id"]
            isOneToOne: false
            referencedRelation: "llm_prompt_chains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_model_responses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_models: {
        Row: {
          created_datetime_utc: string
          id: number
          is_temperature_supported: boolean
          llm_provider_id: number
          name: string
          provider_model_id: string
        }
        Insert: {
          created_datetime_utc?: string
          id?: number
          is_temperature_supported?: boolean
          llm_provider_id: number
          name: string
          provider_model_id: string
        }
        Update: {
          created_datetime_utc?: string
          id?: number
          is_temperature_supported?: boolean
          llm_provider_id?: number
          name?: string
          provider_model_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_models_llm_provider_id_fkey"
            columns: ["llm_provider_id"]
            isOneToOne: false
            referencedRelation: "llm_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_output_types: {
        Row: {
          created_datetime_utc: string
          description: string
          id: number
          slug: string
        }
        Insert: {
          created_datetime_utc?: string
          description: string
          id?: number
          slug: string
        }
        Update: {
          created_datetime_utc?: string
          description?: string
          id?: number
          slug?: string
        }
        Relationships: []
      }
      llm_prompt_chains: {
        Row: {
          caption_request_id: number
          created_datetime_utc: string
          id: number
        }
        Insert: {
          caption_request_id: number
          created_datetime_utc?: string
          id?: number
        }
        Update: {
          caption_request_id?: number
          created_datetime_utc?: string
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "llm_prompt_chains_caption_request_id_fkey"
            columns: ["caption_request_id"]
            isOneToOne: false
            referencedRelation: "caption_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_providers: {
        Row: {
          created_datetime_utc: string
          id: number
          name: string
        }
        Insert: {
          created_datetime_utc?: string
          id?: number
          name: string
        }
        Update: {
          created_datetime_utc?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      news_entities: {
        Row: {
          entity: string
          entity_type: string
          id: number
          news_id: number | null
        }
        Insert: {
          entity: string
          entity_type: string
          id?: number
          news_id?: number | null
        }
        Update: {
          entity?: string
          entity_type?: string
          id?: number
          news_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "news_entities_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "news_snippets"
            referencedColumns: ["id"]
          },
        ]
      }
      news_snippets: {
        Row: {
          category: string
          created_at: string | null
          headline: string
          id: number
          is_active: boolean | null
          priority: number | null
          source_url: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          headline: string
          id?: number
          is_active?: boolean | null
          priority?: number | null
          source_url?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          headline?: string
          id?: number
          is_active?: boolean | null
          priority?: number | null
          source_url?: string | null
        }
        Relationships: []
      }
      personalities: {
        Row: {
          created_datetime_utc: string
          id: number
          modified_datetime_utc: string | null
          name: string
        }
        Insert: {
          created_datetime_utc?: string
          id?: number
          modified_datetime_utc?: string | null
          name: string
        }
        Update: {
          created_datetime_utc?: string
          id?: number
          modified_datetime_utc?: string | null
          name?: string
        }
        Relationships: []
      }
      profile_dorm_mappings: {
        Row: {
          created_at: string | null
          dorm_id: number
          id: number
          profile_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dorm_id: number
          id?: number
          profile_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dorm_id?: number
          id?: number
          profile_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_dorm_mappings_dorm_id_fkey"
            columns: ["dorm_id"]
            isOneToOne: false
            referencedRelation: "dorms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_dorm_mappings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_university_major_mappings: {
        Row: {
          id: string
          profile_id: string
          university_major_id: number | null
        }
        Insert: {
          id?: string
          profile_id: string
          university_major_id?: number | null
        }
        Update: {
          id?: string
          profile_id?: string
          university_major_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_university_major_mappings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_university_major_mappings_university_major_id_fkey"
            columns: ["university_major_id"]
            isOneToOne: false
            referencedRelation: "university_major_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_university_mappings: {
        Row: {
          created_at: string | null
          id: number
          profile_id: string
          university_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          profile_id: string
          university_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          profile_id?: string
          university_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_university_mappings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_university_mappings_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_datetime_utc: string | null
          email: string | null
          first_name: string | null
          id: string
          is_in_study: boolean
          is_matrix_admin: boolean
          is_superadmin: boolean
          last_name: string | null
          modified_datetime_utc: string | null
        }
        Insert: {
          created_datetime_utc?: string | null
          email?: string | null
          first_name?: string | null
          id: string
          is_in_study?: boolean
          is_matrix_admin?: boolean
          is_superadmin?: boolean
          last_name?: string | null
          modified_datetime_utc?: string | null
        }
        Update: {
          created_datetime_utc?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_in_study?: boolean
          is_matrix_admin?: boolean
          is_superadmin?: boolean
          last_name?: string | null
          modified_datetime_utc?: string | null
        }
        Relationships: []
      }
      reported_captions: {
        Row: {
          caption_id: string | null
          created_datetime_utc: string
          id: number
          profile_id: string | null
          reason: string | null
        }
        Insert: {
          caption_id?: string | null
          created_datetime_utc?: string
          id?: number
          profile_id?: string | null
          reason?: string | null
        }
        Update: {
          caption_id?: string | null
          created_datetime_utc?: string
          id?: number
          profile_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reported_captions_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "captions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reported_captions_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "v_richest_image_dedup"
            referencedColumns: ["caption_id"]
          },
          {
            foreignKeyName: "reported_captions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reported_images: {
        Row: {
          created_datetime_utc: string
          id: number
          image_id: string | null
          profile_id: string | null
          reason: string | null
        }
        Insert: {
          created_datetime_utc?: string
          id?: number
          image_id?: string | null
          profile_id?: string | null
          reason?: string | null
        }
        Update: {
          created_datetime_utc?: string
          id?: number
          image_id?: string | null
          profile_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reported_images_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reported_images_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      screenshots: {
        Row: {
          caption_id: string | null
          created_datetime_utc: string
          id: number
          profile_id: string | null
        }
        Insert: {
          caption_id?: string | null
          created_datetime_utc?: string
          id?: number
          profile_id?: string | null
        }
        Update: {
          caption_id?: string | null
          created_datetime_utc?: string
          id?: number
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "screenshots_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "captions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshots_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "v_richest_image_dedup"
            referencedColumns: ["caption_id"]
          },
          {
            foreignKeyName: "screenshots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      share_to_destinations: {
        Row: {
          created_datetime_utc: string
          id: number
          modified_datetime_utc: string | null
          name: string | null
        }
        Insert: {
          created_datetime_utc?: string
          id?: number
          modified_datetime_utc?: string | null
          name?: string | null
        }
        Update: {
          created_datetime_utc?: string
          id?: number
          modified_datetime_utc?: string | null
          name?: string | null
        }
        Relationships: []
      }
      shares: {
        Row: {
          caption_id: string | null
          created_datetime_utc: string
          id: number
          profile_id: string | null
          proper_destination: string | null
          share_to_destination_id: number | null
        }
        Insert: {
          caption_id?: string | null
          created_datetime_utc?: string
          id?: number
          profile_id?: string | null
          proper_destination?: string | null
          share_to_destination_id?: number | null
        }
        Update: {
          caption_id?: string | null
          created_datetime_utc?: string
          id?: number
          profile_id?: string | null
          proper_destination?: string | null
          share_to_destination_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shares_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "captions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shares_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "v_richest_image_dedup"
            referencedColumns: ["caption_id"]
          },
          {
            foreignKeyName: "shares_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shares_share_to_destination_id_fkey"
            columns: ["share_to_destination_id"]
            isOneToOne: false
            referencedRelation: "share_to_destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      sidechat_posts: {
        Row: {
          content: string | null
          created_datetime_utc: string
          id: string
          like_count: number
          post_datetime_utc: string
        }
        Insert: {
          content?: string | null
          created_datetime_utc?: string
          id: string
          like_count?: number
          post_datetime_utc: string
        }
        Update: {
          content?: string | null
          created_datetime_utc?: string
          id?: string
          like_count?: number
          post_datetime_utc?: string
        }
        Relationships: []
      }
      studies: {
        Row: {
          created_datetime_utc: string
          description: string | null
          end_datetime_utc: string | null
          id: number
          slug: string | null
          start_datetime_utc: string | null
        }
        Insert: {
          created_datetime_utc?: string
          description?: string | null
          end_datetime_utc?: string | null
          id?: number
          slug?: string | null
          start_datetime_utc?: string | null
        }
        Update: {
          created_datetime_utc?: string
          description?: string | null
          end_datetime_utc?: string | null
          id?: number
          slug?: string | null
          start_datetime_utc?: string | null
        }
        Relationships: []
      }
      study_caption_mappings: {
        Row: {
          caption_id: string
          created_datetime_utc: string
          id: number
          study_id: number
        }
        Insert: {
          caption_id: string
          created_datetime_utc?: string
          id?: number
          study_id: number
        }
        Update: {
          caption_id?: string
          created_datetime_utc?: string
          id?: number
          study_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_caption_mappings_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "captions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_caption_mappings_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "v_richest_image_dedup"
            referencedColumns: ["caption_id"]
          },
          {
            foreignKeyName: "study_caption_mappings_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      study_caption_navigation_events: {
        Row: {
          caption_id: string
          client_event_id: string
          created_by_user_id: string
          created_datetime_utc: string
          id: number
          input_method:
            | "button"
            | "swipe"
            | "keyboard"
            | "unknown"
          profile_id: string
          session_id: string | null
          study_caption_mapping_id: number | null
          time_to_next_caption_ms: number
        }
        Insert: {
          caption_id: string
          client_event_id: string
          created_by_user_id?: string
          created_datetime_utc?: string
          id?: number
          input_method:
            | "button"
            | "swipe"
            | "keyboard"
            | "unknown"
          profile_id: string
          session_id?: string | null
          study_caption_mapping_id?: number | null
          time_to_next_caption_ms: number
        }
        Update: {
          caption_id?: string
          client_event_id?: string
          created_by_user_id?: string
          created_datetime_utc?: string
          id?: number
          input_method?:
            | "button"
            | "swipe"
            | "keyboard"
            | "unknown"
          profile_id?: string
          session_id?: string | null
          study_caption_mapping_id?: number | null
          time_to_next_caption_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_caption_navigation_events_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "captions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_caption_navigation_events_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "v_richest_image_dedup"
            referencedColumns: ["caption_id"]
          },
          {
            foreignKeyName: "study_caption_navigation_events_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_caption_navigation_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_caption_navigation_events_study_caption_mapping_id_fkey"
            columns: ["study_caption_mapping_id"]
            isOneToOne: false
            referencedRelation: "study_caption_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      study_caption_vote_events: {
        Row: {
          caption_id: string
          client_event_id: string
          created_by_user_id: string
          created_datetime_utc: string
          id: number
          input_method:
            | "button"
            | "swipe"
            | "keyboard"
            | "unknown"
          profile_id: string
          session_id: string | null
          study_caption_mapping_id: number | null
          time_to_vote_ms: number | null
          vote_value:
            | "didnt get it"
            | "not funny at all"
            | "not very funny"
            | "meh"
            | "funny"
            | "very funny"
        }
        Insert: {
          caption_id: string
          client_event_id: string
          created_by_user_id?: string
          created_datetime_utc?: string
          id?: number
          input_method:
            | "button"
            | "swipe"
            | "keyboard"
            | "unknown"
          profile_id: string
          session_id?: string | null
          study_caption_mapping_id?: number | null
          time_to_vote_ms?: number | null
          vote_value:
            | "didnt get it"
            | "not funny at all"
            | "not very funny"
            | "meh"
            | "funny"
            | "very funny"
        }
        Update: {
          caption_id?: string
          client_event_id?: string
          created_by_user_id?: string
          created_datetime_utc?: string
          id?: number
          input_method?:
            | "button"
            | "swipe"
            | "keyboard"
            | "unknown"
          profile_id?: string
          session_id?: string | null
          study_caption_mapping_id?: number | null
          time_to_vote_ms?: number | null
          vote_value?:
            | "didnt get it"
            | "not funny at all"
            | "not very funny"
            | "meh"
            | "funny"
            | "very funny"
        }
        Relationships: [
          {
            foreignKeyName: "study_caption_vote_events_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "captions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_caption_vote_events_caption_id_fkey"
            columns: ["caption_id"]
            isOneToOne: false
            referencedRelation: "v_richest_image_dedup"
            referencedColumns: ["caption_id"]
          },
          {
            foreignKeyName: "study_caption_vote_events_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_caption_vote_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_caption_vote_events_study_caption_mapping_id_fkey"
            columns: ["study_caption_mapping_id"]
            isOneToOne: false
            referencedRelation: "study_caption_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      study_image_set_image_mappings: {
        Row: {
          created_datetime_utc: string
          id: number
          image_id: string
          study_image_set_id: number
        }
        Insert: {
          created_datetime_utc?: string
          id?: number
          image_id: string
          study_image_set_id: number
        }
        Update: {
          created_datetime_utc?: string
          id?: number
          image_id?: string
          study_image_set_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_image_set_image_mappings_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_image_set_image_mappings_study_image_set_id_fkey"
            columns: ["study_image_set_id"]
            isOneToOne: false
            referencedRelation: "study_image_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      study_image_sets: {
        Row: {
          created_datetime_utc: string
          description: string | null
          id: number
          modified_datetime_utc: string
          slug: string
        }
        Insert: {
          created_datetime_utc?: string
          description?: string | null
          id?: number
          modified_datetime_utc?: string
          slug: string
        }
        Update: {
          created_datetime_utc?: string
          description?: string | null
          id?: number
          modified_datetime_utc?: string
          slug?: string
        }
        Relationships: []
      }
      term_types: {
        Row: {
          created_datetime_utc: string
          id: number
          name: string
        }
        Insert: {
          created_datetime_utc?: string
          id?: number
          name: string
        }
        Update: {
          created_datetime_utc?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      terms: {
        Row: {
          created_datetime_utc: string
          definition: string
          example: string
          id: number
          modified_datetime_utc: string | null
          priority: number
          term: string
          term_type_id: number | null
        }
        Insert: {
          created_datetime_utc?: string
          definition: string
          example: string
          id?: number
          modified_datetime_utc?: string | null
          priority?: number
          term: string
          term_type_id?: number | null
        }
        Update: {
          created_datetime_utc?: string
          definition?: string
          example?: string
          id?: number
          modified_datetime_utc?: string | null
          priority?: number
          term?: string
          term_type_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "terms_term_type_id_fkey"
            columns: ["term_type_id"]
            isOneToOne: false
            referencedRelation: "term_types"
            referencedColumns: ["id"]
          },
        ]
      }
      testflight_errors: {
        Row: {
          created_datetime_utc: string
          error: string | null
          id: number
        }
        Insert: {
          created_datetime_utc?: string
          error?: string | null
          id?: number
        }
        Update: {
          created_datetime_utc?: string
          error?: string | null
          id?: number
        }
        Relationships: []
      }
      transcript_personality_mappings: {
        Row: {
          created_datetime_utc: string
          id: number
          personality_id: number
          transcript_id: number
        }
        Insert: {
          created_datetime_utc?: string
          id?: number
          personality_id: number
          transcript_id: number
        }
        Update: {
          created_datetime_utc?: string
          id?: number
          personality_id?: number
          transcript_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "transcript_personality_mappings_personality_id_fkey"
            columns: ["personality_id"]
            isOneToOne: false
            referencedRelation: "personalities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_personality_mappings_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          content: string
          created_datetime_utc: string
          id: number
          modified_datetime_utc: string | null
        }
        Insert: {
          content: string
          created_datetime_utc?: string
          id?: number
          modified_datetime_utc?: string | null
        }
        Update: {
          content?: string
          created_datetime_utc?: string
          id?: number
          modified_datetime_utc?: string | null
        }
        Relationships: []
      }
      universities: {
        Row: {
          created_at: string | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      university_major_mappings: {
        Row: {
          id: number
          major_id: number | null
          university_id: number
        }
        Insert: {
          id: number
          major_id?: number | null
          university_id: number
        }
        Update: {
          id?: number
          major_id?: number | null
          university_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "university_major_mappings_major_id_fkey"
            columns: ["major_id"]
            isOneToOne: false
            referencedRelation: "university_majors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "university_major_mappings_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      university_majors: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      whitelist_email_addresses: {
        Row: {
          created_datetime_utc: string
          email_address: string
          id: number
          modified_datetime_utc: string | null
        }
        Insert: {
          created_datetime_utc?: string
          email_address: string
          id?: number
          modified_datetime_utc?: string | null
        }
        Update: {
          created_datetime_utc?: string
          email_address?: string
          id?: number
          modified_datetime_utc?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_richest_image_dedup: {
        Row: {
          caption_id: string | null
          content: string | null
          created_datetime_utc: string | null
          image_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "captions_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_access_caption:
        | {
            Args: { target_caption_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.can_access_caption(target_caption_id => text), public.can_access_caption(target_caption_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { target_caption_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.can_access_caption(target_caption_id => text), public.can_access_caption(target_caption_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      can_access_image:
        | {
            Args: { target_image_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.can_access_image(target_image_id => text), public.can_access_image(target_image_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { target_image_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.can_access_image(target_image_id => text), public.can_access_image(target_image_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      can_access_invitation_by_token: {
        Args: { target_token: string }
        Returns: boolean
      }
      check_unique_image_report: {
        Args: { check_image_id: string; check_profile_id: string }
        Returns: boolean
      }
      cleanup_expired_invitations: { Args: never; Returns: undefined }
      increment_link_visit_count: {
        Args: { link_slug: string }
        Returns: undefined
      }
      is_superadmin:
        | {
            Args: { user_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.is_superadmin(user_id => text), public.is_superadmin(user_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { user_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.is_superadmin(user_id => text), public.is_superadmin(user_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      is_valid_category_image_mapping:
        | { Args: { category_id: number; img_id: string }; Returns: boolean }
        | { Args: { category_id: number; img_id: string }; Returns: boolean }
        | { Args: { category_id: number; img_id: string }; Returns: boolean }
      match_community_contexts: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          community_id: number
          id: number
          similarity: number
          text: string
        }[]
      }
      smart_deactivate_news: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
