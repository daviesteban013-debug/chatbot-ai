export interface Business {
  id: string;
  name: string;
  ownerName: string;
  niche: string;
  plan: "free" | "pro" | "business";
  subscriptionStatus: "active" | "trialing" | "past_due" | "canceled";
  currentPeriodEnd: string;
  monthlyPrice: number;
}

export interface AgentProfile {
  id: string;
  botName: string;
  tone: "friendly" | "professional" | "casual" | "formal";
  style: "preset" | "custom";
  niche: string;
  systemPrompt: string;
  businessRules: string;
}

export interface Appointment {
  id: string;
  clientName: string;
  clientPhone: string;
  service: string;
  date: string;
  time: string;
  status: "confirmed" | "pending" | "canceled";
}

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  clientName: string;
  clientPhone: string;
  items: OrderItem[];
  total: number;
  status: "pending" | "paid" | "delivered" | "canceled";
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  clientName: string;
  direction: "inbound" | "outbound";
  text: string;
  timestamp: string;
  isVoice: boolean;
}

export interface ActivityItem {
  id: string;
  type: "appointment" | "order" | "message";
  description: string;
  timestamp: string;
}
