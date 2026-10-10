// =====================================================================
// Tipos TypeScript del esquema V1 (supabase/migrations/001_initial_schema.sql)
// Agente vendedor por WhatsApp — multi-tenant, dinero en COP (integer).
// Incluye interfaces Row por tabla + tipo Database para tipar los clientes
// de @supabase/supabase-js / @supabase/ssr.
// =====================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ---------- Enums ----------
export type AgentMode = "shadow" | "copilot" | "autonomous";
export type ConversationStatus = "open" | "handoff" | "closed";
export type MessageDirection = "inbound" | "outbound";
export type MessageSender = "customer" | "agent" | "human";
export type MessageType = "text" | "audio" | "image" | "document" | "other";
export type OrderType = "retail" | "wholesale";
export type OrderStatus =
  | "draft"
  | "pending_approval"
  | "pending_payment"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "canceled";
export type PaymentMethod =
  | "enlace"
  | "contraentrega"
  | "transferencia"
  | "nequi"
  | "daviplata"
  | "bancolombia"
  | "pse"
  | "otro";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type HandoffReason =
  | "reclamo"
  | "negociacion"
  | "incertidumbre"
  | "fuera_de_catalogo"
  | "solicitud_cliente"
  | "pedido_alto_valor"
  | "otro";
export type HandoffStatus = "open" | "taken" | "resolved";
export type RunStatus =
  | "sent"
  | "proposed"
  | "approved"
  | "edited"
  | "rejected"
  | "error";

export type TenantMemberRole = "owner" | "agent" | "viewer";
export type HandoffPriority = "low" | "normal" | "high";

// ---------- Row types ----------
// Se declaran como `type` (no `interface`) a propósito: los type aliases de
// objetos reciben una firma de índice implícita, lo que los hace asignables a
// `Record<string, unknown>` y satisface las restricciones genéricas de
// supabase-js v2.117. Con `interface` las consultas colapsan a `never`.
export type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  created_at: string;
}

export type TenantMember = {
  tenant_id: string;
  user_id: string;
  role: TenantMemberRole;
}

export type WhatsappAccount = {
  id: string;
  tenant_id: string;
  phone_number_id: string;
  waba_id: string | null;
  display_phone: string | null;
  access_token_enc: string | null;
  connection_status: "pending" | "verified" | "needs_attention";
  verified_at: string | null;
  last_webhook_at: string | null;
  created_at: string;
}

export type Agent = {
  id: string;
  tenant_id: string;
  name: string;
  tone: string;
  system_prompt: string;
  business_rules: Json;
  mode: AgentMode;
  model: string;
  auto_confirm_max_total: number;
  max_discount_pct: number;
  active: boolean;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export type Product = {
  id: string;
  tenant_id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  price_retail: number;
  price_wholesale: number | null;
  wholesale_min_qty: number | null;
  active: boolean;
  created_at: string;
}

export type ProductVariant = {
  id: string;
  tenant_id: string;
  product_id: string;
  sku: string;
  color: string | null;
  size: string | null;
  price_override: number | null;
  stock_qty: number;
  reserved_qty: number;
  image_url: string | null;
  active: boolean;
}

export type Customer = {
  id: string;
  tenant_id: string;
  phone: string;
  name: string | null;
  city: string | null;
  notes: string | null;
  created_at: string;
}

export type Conversation = {
  id: string;
  tenant_id: string;
  customer_id: string;
  status: ConversationStatus;
  assigned_to: string | null;
  last_message_at: string;
  created_at: string;
}

export type Message = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  direction: MessageDirection;
  sender: MessageSender;
  type: MessageType;
  body: string | null;
  media_url: string | null;
  transcript: string | null;
  wa_message_id: string | null;
  raw: Json | null;
  created_at: string;
}

export type Order = {
  id: string;
  tenant_id: string;
  conversation_id: string | null;
  customer_id: string;
  order_type: OrderType;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  shipping_cost: number;
  total: number;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  recipient_name: string | null;
  recipient_phone: string | null;
  shipping_department: string | null;
  shipping_city: string | null;
  shipping_neighborhood: string | null;
  shipping_address: string | null;
  shipping_notes: string | null;
  carrier: string | null;
  tracking_code: string | null;
  created_by: MessageSender;
  created_at: string;
  updated_at: string;
}

export type OrderItem = {
  id: string;
  tenant_id: string;
  order_id: string;
  variant_id: string;
  name_snapshot: string;
  qty: number;
  unit_price: number;
}

export type Handoff = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  reason: HandoffReason;
  summary: string;
  priority: HandoffPriority;
  status: HandoffStatus;
  taken_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export type AgentRun = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  trigger_message_id: string | null;
  mode: AgentMode;
  proposed_reply: string | null;
  final_reply: string | null;
  tool_calls: Json;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  status: RunStatus;
  error: string | null;
  created_at: string;
}

export type EvalCase = {
  id: string;
  tenant_id: string;
  name: string;
  transcript: Json;
  expected: Json;
  created_at: string;
}

export type EvalResult = {
  id: string;
  tenant_id: string;
  eval_case_id: string;
  model: string | null;
  passed: boolean;
  diff: Json | null;
  cost_usd: number | null;
  created_at: string;
}

export type KnowledgeSource = {
  id: string;
  tenant_id: string;
  name: string;
  kind: "manual" | "file";
  status: "draft" | "indexing" | "ready" | "failed" | "archived";
  embedding_model: "text-embedding-3-small";
  revision: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type KnowledgeChunk = {
  id: string;
  tenant_id: string;
  source_id: string;
  revision: number;
  chunk_index: number;
  content: string;
  embedding: string;
  page_number: number | null;
  metadata: Json;
  created_at: string;
};

export type KnowledgeMatch = Pick<KnowledgeChunk,
  "id" | "source_id" | "revision" | "chunk_index" | "content" | "page_number" | "metadata"
> & { source_name: string; similarity: number };

// ---------- Database (tipado de clientes Supabase) ----------
export type Database = {
  public: {
    Tables: {
      knowledge_sources: {
        Row: KnowledgeSource;
        Insert: Pick<KnowledgeSource, "tenant_id" | "name" | "kind"> &
          Partial<Omit<KnowledgeSource, "tenant_id" | "name" | "kind">>;
        Update: Partial<Omit<KnowledgeSource, "id" | "tenant_id" | "created_at">>;
        Relationships: [{
          foreignKeyName: "knowledge_sources_tenant_id_fkey";
          columns: ["tenant_id"];
          isOneToOne: false;
          referencedRelation: "tenants";
          referencedColumns: ["id"];
        }];
      };
      knowledge_chunks: {
        Row: KnowledgeChunk;
        Insert: Pick<KnowledgeChunk, "tenant_id" | "source_id" | "chunk_index" | "content" | "embedding"> &
          Partial<Omit<KnowledgeChunk, "tenant_id" | "source_id" | "chunk_index" | "content" | "embedding">>;
        Update: Partial<Pick<KnowledgeChunk, "content" | "embedding" | "page_number" | "metadata">>;
        Relationships: [{
          foreignKeyName: "knowledge_chunks_source_id_tenant_id_fkey";
          columns: ["source_id", "tenant_id"];
          isOneToOne: false;
          referencedRelation: "knowledge_sources";
          referencedColumns: ["id", "tenant_id"];
        }, {
          foreignKeyName: "knowledge_chunks_tenant_id_fkey";
          columns: ["tenant_id"];
          isOneToOne: false;
          referencedRelation: "tenants";
          referencedColumns: ["id"];
        }];
      };
      jarvis_files: {
        Row: { id: string; user_id: string; session_id: string | null; filename: string; object_path: string; mime_type: string; byte_size: number; status: string; sections: Json; section_count: number; warnings: Json; truncated: boolean; created_at: string };
        Insert: { id?: string; user_id: string; session_id?: string | null; filename: string; object_path: string; mime_type: string; byte_size: number; status: string; sections: Json; warnings: Json; truncated?: boolean; created_at?: string };
        Update: { session_id?: string | null; status?: string; sections?: Json; warnings?: Json; truncated?: boolean };
        Relationships: [];
      };
      tenants: {
        Row: Tenant;
        Insert: {
          id?: string;
          name: string;
          slug: string;
          plan?: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          plan?: string;
          status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      tenant_members: {
        Row: TenantMember;
        Insert: {
          tenant_id: string;
          user_id: string;
          role?: TenantMemberRole;
        };
        Update: {
          tenant_id?: string;
          user_id?: string;
          role?: TenantMemberRole;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_accounts: {
        Row: WhatsappAccount;
        Insert: {
          id?: string;
          tenant_id: string;
          phone_number_id: string;
          waba_id?: string | null;
          display_phone?: string | null;
          access_token_enc?: string | null;
          connection_status?: "pending" | "verified" | "needs_attention";
          verified_at?: string | null;
          last_webhook_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          phone_number_id?: string;
          waba_id?: string | null;
          display_phone?: string | null;
          access_token_enc?: string | null;
          connection_status?: "pending" | "verified" | "needs_attention";
          verified_at?: string | null;
          last_webhook_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_accounts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      agents: {
        Row: Agent;
        Insert: {
          id?: string;
          tenant_id: string;
          name?: string;
          tone?: string;
          system_prompt?: string;
          business_rules?: Json;
          mode?: AgentMode;
          model?: string;
          auto_confirm_max_total?: number;
          max_discount_pct?: number;
          active?: boolean;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          tone?: string;
          system_prompt?: string;
          business_rules?: Json;
          mode?: AgentMode;
          model?: string;
          auto_confirm_max_total?: number;
          max_discount_pct?: number;
          active?: boolean;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: Product;
        Insert: {
          id?: string;
          tenant_id: string;
          sku: string;
          name: string;
          description?: string | null;
          category?: string | null;
          price_retail: number;
          price_wholesale?: number | null;
          wholesale_min_qty?: number | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          sku?: string;
          name?: string;
          description?: string | null;
          category?: string | null;
          price_retail?: number;
          price_wholesale?: number | null;
          wholesale_min_qty?: number | null;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      product_variants: {
        Row: ProductVariant;
        Insert: {
          id?: string;
          tenant_id: string;
          product_id: string;
          sku: string;
          color?: string | null;
          size?: string | null;
          price_override?: number | null;
          stock_qty?: number;
          reserved_qty?: number;
          image_url?: string | null;
          active?: boolean;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          product_id?: string;
          sku?: string;
          color?: string | null;
          size?: string | null;
          price_override?: number | null;
          stock_qty?: number;
          reserved_qty?: number;
          image_url?: string | null;
          active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: Customer;
        Insert: {
          id?: string;
          tenant_id: string;
          phone: string;
          name?: string | null;
          city?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          phone?: string;
          name?: string | null;
          city?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: Conversation;
        Insert: {
          id?: string;
          tenant_id: string;
          customer_id: string;
          status?: ConversationStatus;
          assigned_to?: string | null;
          last_message_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          customer_id?: string;
          status?: ConversationStatus;
          assigned_to?: string | null;
          last_message_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: Message;
        Insert: {
          id?: string;
          tenant_id: string;
          conversation_id: string;
          direction: MessageDirection;
          sender: MessageSender;
          type?: MessageType;
          body?: string | null;
          media_url?: string | null;
          transcript?: string | null;
          wa_message_id?: string | null;
          raw?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          conversation_id?: string;
          direction?: MessageDirection;
          sender?: MessageSender;
          type?: MessageType;
          body?: string | null;
          media_url?: string | null;
          transcript?: string | null;
          wa_message_id?: string | null;
          raw?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      nexo_work_items: {
        Row: import("./workspace").WorkItem;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      nexo_task_reminders: {
        Row: import("./workspace").TaskReminder;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      nexo_work_events: {
        Row: { id: number; tenant_id: string; item_id: string; actor_id: string | null; action: string; revision: number; created_at: string };
        Insert: never; Update: never; Relationships: [];
      };
      nexo_order_proposals: {
        Row: { id: string; tenant_id: string; user_id: string; session_id: string; request_key: string; status: string; snapshot: Json; order_id: string | null; handoff_id: string | null; created_at: string; expires_at: string; decided_at: string | null };
        Insert: { tenant_id: string; user_id: string; session_id: string; request_key: string; snapshot: Json };
        Update: { status?: string; decided_at?: string; order_id?: string; handoff_id?: string };
        Relationships: [];
      };
      orders: {
        Row: Order;
        Insert: {
          id?: string;
          tenant_id: string;
          conversation_id?: string | null;
          customer_id: string;
          order_type?: OrderType;
          status?: OrderStatus;
          subtotal?: number;
          discount?: number;
          shipping_cost?: number;
          total?: number;
          payment_method?: PaymentMethod | null;
          payment_status?: PaymentStatus;
          recipient_name?: string | null;
          recipient_phone?: string | null;
          shipping_department?: string | null;
          shipping_city?: string | null;
          shipping_neighborhood?: string | null;
          shipping_address?: string | null;
          shipping_notes?: string | null;
          carrier?: string | null;
          tracking_code?: string | null;
          created_by?: MessageSender;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          conversation_id?: string | null;
          customer_id?: string;
          order_type?: OrderType;
          status?: OrderStatus;
          subtotal?: number;
          discount?: number;
          shipping_cost?: number;
          total?: number;
          payment_method?: PaymentMethod | null;
          payment_status?: PaymentStatus;
          recipient_name?: string | null;
          recipient_phone?: string | null;
          shipping_department?: string | null;
          shipping_city?: string | null;
          shipping_neighborhood?: string | null;
          shipping_address?: string | null;
          shipping_notes?: string | null;
          carrier?: string | null;
          tracking_code?: string | null;
          created_by?: MessageSender;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: OrderItem;
        Insert: {
          id?: string;
          tenant_id: string;
          order_id: string;
          variant_id: string;
          name_snapshot: string;
          qty: number;
          unit_price: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          order_id?: string;
          variant_id?: string;
          name_snapshot?: string;
          qty?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      handoffs: {
        Row: Handoff;
        Insert: {
          id?: string;
          tenant_id: string;
          conversation_id: string;
          reason: HandoffReason;
          summary: string;
          priority?: HandoffPriority;
          status?: HandoffStatus;
          taken_by?: string | null;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          conversation_id?: string;
          reason?: HandoffReason;
          summary?: string;
          priority?: HandoffPriority;
          status?: HandoffStatus;
          taken_by?: string | null;
          created_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "handoffs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "handoffs_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_runs: {
        Row: AgentRun;
        Insert: {
          id?: string;
          tenant_id: string;
          conversation_id: string;
          trigger_message_id?: string | null;
          mode: AgentMode;
          proposed_reply?: string | null;
          final_reply?: string | null;
          tool_calls?: Json;
          model?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          cost_usd?: number | null;
          latency_ms?: number | null;
          status: RunStatus;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          conversation_id?: string;
          trigger_message_id?: string | null;
          mode?: AgentMode;
          proposed_reply?: string | null;
          final_reply?: string | null;
          tool_calls?: Json;
          model?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          cost_usd?: number | null;
          latency_ms?: number | null;
          status?: RunStatus;
          error?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_runs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_runs_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_runs_trigger_message_id_fkey";
            columns: ["trigger_message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      eval_cases: {
        Row: EvalCase;
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          transcript: Json;
          expected: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          transcript?: Json;
          expected?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "eval_cases_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      eval_results: {
        Row: EvalResult;
        Insert: {
          id?: string;
          tenant_id: string;
          eval_case_id: string;
          model?: string | null;
          passed: boolean;
          diff?: Json | null;
          cost_usd?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          eval_case_id?: string;
          model?: string | null;
          passed?: boolean;
          diff?: Json | null;
          cost_usd?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "eval_results_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "eval_results_eval_case_id_fkey";
            columns: ["eval_case_id"];
            isOneToOne: false;
            referencedRelation: "eval_cases";
            referencedColumns: ["id"];
          },
        ];
      };
      jarvis_configs: {
        Row: {
          tenant_id: string;
          config: Json;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          config?: Json;
          updated_at?: string;
        };
        Update: {
          tenant_id?: string;
          config?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jarvis_configs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      jarvis_sessions: {
        Row: {
          id: string;
          session_id: string;
          user_id: string | null;
          tenant_id: string | null;
          title: string;
          status: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id?: string | null;
          tenant_id?: string | null;
          title?: string;
          status?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          user_id?: string | null;
          tenant_id?: string | null;
          title?: string;
          status?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jarvis_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jarvis_sessions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      jarvis_messages: {
        Row: {
          id: string;
          session_id: string;
          role: string;
          content: string;
          tokens_in: number;
          tokens_out: number;
          latency_ms: number;
          status: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: string;
          content: string;
          tokens_in?: number;
          tokens_out?: number;
          latency_ms?: number;
          status?: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          role?: string;
          content?: string;
          tokens_in?: number;
          tokens_out?: number;
          latency_ms?: number;
          status?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jarvis_messages_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "jarvis_sessions";
            referencedColumns: ["session_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      nexo_configure_sales_payments: { Args: { p_tenant: string; p_user: string; p_link: string; p_transfer: string }; Returns: Json };
      nexo_sales_snapshot: { Args: { p_tenant: string; p_conversation: string; p_customer: string; p_order: string }; Returns: Json };
      nexo_create_whatsapp_order: { Args: { p_tenant: string; p_conversation: string; p_customer: string; p_items: Json; p_order_type: OrderType; p_payment: PaymentMethod; p_shipping: number }; Returns: Json };
      nexo_cancel_whatsapp_draft: { Args: { p_tenant: string; p_conversation: string; p_customer: string; p_order: string }; Returns: Json };
      nexo_confirm_whatsapp_order: { Args: { p_tenant: string; p_conversation: string; p_customer: string; p_order: string; p_trigger: string }; Returns: Json };
      nexo_propose_work: { Args: { p_tenant: string; p_user: string; p_session: string | null; p_key: string; p_input: Json }; Returns: Json };
      nexo_change_work: { Args: { p_tenant: string; p_user: string; p_id: string; p_revision: number; p_action: string; p_patch?: Json }; Returns: Json };
      nexo_enqueue_task_reminders: { Args: Record<string, never>; Returns: number };
      nexo_message_balance: { Args: { p_tenant_id: string | null; p_user_id: string | null }; Returns: Json };
      reserve_nexo_message: { Args: { p_id: string; p_tenant_id: string | null; p_user_id: string | null }; Returns: Json };
      finish_nexo_message: { Args: { p_id: string; p_completed: boolean }; Returns: undefined };
      reserve_nexo_model: { Args: { p_id: string; p_message_id: string; p_tenant_id: string | null; p_user_id: string | null; p_requested: number }; Returns: Json };
      settle_nexo_model: { Args: { p_id: string; p_tokens_in: number; p_tokens_out: number; p_model: string }; Returns: undefined };
      release_nexo_model: { Args: { p_id: string }; Returns: undefined };
      configure_whatsapp_cloud: {
        Args: { p_tenant: string; p_user: string; p_phone: string; p_waba: string; p_display: string; p_ciphertext: string };
        Returns: string;
      };
      match_knowledge_chunks: {
        Args: { p_tenant_id: string; p_embedding: string; p_limit?: number; p_min_similarity?: number };
        Returns: KnowledgeMatch[];
      };
      nexo_prepare_order: {
        Args: { p_tenant: string; p_user: string; p_session: string; p_customer: string; p_items: Json };
        Returns: Json;
      };
      nexo_decide_order: {
        Args: { p_id: string; p_user: string; p_decision: string };
        Returns: Json;
      };
      credit_balance: {
        Args: { p_tenant_id: string | null; p_user_id: string | null };
        Returns: Json;
      };
      reserve_credits: {
        Args: { p_id: string; p_tenant_id: string | null; p_user_id: string | null; p_requested: number; p_minimum: number; p_channel: string };
        Returns: Json;
      };
      settle_credits: {
        Args: { p_id: string; p_tokens_in: number; p_tokens_out: number; p_model: string };
        Returns: undefined;
      };
      release_credits: {
        Args: { p_id: string };
        Returns: undefined;
      };
      is_tenant_member: {
        Args: { t: string };
        Returns: boolean;
      };
      release_variant_stock: {
        Args: { p_variant: string; p_qty: number };
        Returns: undefined;
      };
      reserve_variant_stock: {
        Args: { p_variant: string; p_qty: number };
        Returns: boolean;
      };
    };
    Enums: {
      agent_mode: AgentMode;
      conversation_status: ConversationStatus;
      message_direction: MessageDirection;
      message_sender: MessageSender;
      message_type: MessageType;
      order_type: OrderType;
      order_status: OrderStatus;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
      handoff_reason: HandoffReason;
      handoff_status: HandoffStatus;
      run_status: RunStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
