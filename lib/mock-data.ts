import type {
  Business,
  AgentProfile,
  Appointment,
  Order,
  ChatMessage,
  ActivityItem,
} from "./types";

export const business: Business = {
  id: "biz_01",
  name: "Café Aurora",
  ownerName: "Valeria Ortega",
  niche: "Restaurante y cafetería",
  plan: "pro",
  subscriptionStatus: "active",
  currentPeriodEnd: "2026-10-15",
  monthlyPrice: 29.0,
};

export const agentProfile: AgentProfile = {
  id: "agent_01",
  botName: "Aurora",
  tone: "friendly",
  style: "preset",
  niche: "Restaurante y cafetería",
  systemPrompt:
    "Eres Aurora, la asistente virtual de Café Aurora. Atiendes a los clientes por WhatsApp con un tono cercano y amable. Ayudas a reservar mesas, tomar pedidos a domicilio y responder dudas sobre el menú, los horarios y las promociones. Siempre confirmas los datos antes de cerrar una reserva o un pedido.",
  businessRules:
    "Horario de atención: lunes a domingo de 08:00 a 23:00. Las reservas se confirman con nombre, número de personas y hora. Los pedidos a domicilio tienen un monto mínimo de $10.00 y un tiempo estimado de entrega de 35 a 50 minutos. Si un cliente solicita algo fuera del menú o una queja, escala la conversación al dueño.",
};

export const appointments: Appointment[] = [
  {
    id: "apt_01",
    clientName: "Juan Martínez",
    clientPhone: "+52 55 1234 5678",
    service: "Reserva mesa para 4 personas",
    date: "2026-09-29",
    time: "15:00",
    status: "confirmed",
  },
  {
    id: "apt_02",
    clientName: "Lucía Fernández",
    clientPhone: "+52 55 2345 6789",
    service: "Reserva terraza para 2 personas",
    date: "2026-09-29",
    time: "20:30",
    status: "confirmed",
  },
  {
    id: "apt_03",
    clientName: "Carlos Mendoza",
    clientPhone: "+52 55 3456 7890",
    service: "Reserva mesa para 6 personas",
    date: "2026-09-29",
    time: "13:00",
    status: "pending",
  },
  {
    id: "apt_04",
    clientName: "María López",
    clientPhone: "+52 55 4567 8901",
    service: "Reserva celebración de cumpleaños",
    date: "2026-09-30",
    time: "19:00",
    status: "confirmed",
  },
  {
    id: "apt_05",
    clientName: "Andrés Gutiérrez",
    clientPhone: "+52 55 5678 9012",
    service: "Reserva cena para 2 personas",
    date: "2026-10-02",
    time: "21:00",
    status: "pending",
  },
  {
    id: "apt_06",
    clientName: "Sofía Ramírez",
    clientPhone: "+52 55 6789 0123",
    service: "Reserva mesa para 3 personas",
    date: "2026-09-29",
    time: "12:00",
    status: "canceled",
  },
];

export const orders: Order[] = [
  {
    id: "ord_01",
    clientName: "Juan Martínez",
    clientPhone: "+52 55 1234 5678",
    items: [
      { name: "Cappuccino", quantity: 2, price: 3.5 },
      { name: "Croissant de mantequilla", quantity: 1, price: 2.8 },
    ],
    total: 9.8,
    status: "pending",
    createdAt: "2026-09-29T09:15:00",
  },
  {
    id: "ord_02",
    clientName: "Lucía Fernández",
    clientPhone: "+52 55 2345 6789",
    items: [
      { name: "Tarta de zanahoria", quantity: 1, price: 4.5 },
      { name: "Café americano", quantity: 2, price: 2.5 },
    ],
    total: 9.5,
    status: "pending",
    createdAt: "2026-09-29T11:40:00",
  },
  {
    id: "ord_03",
    clientName: "Carlos Mendoza",
    clientPhone: "+52 55 3456 7890",
    items: [
      { name: "Sándwich club", quantity: 2, price: 6.9 },
      { name: "Limonada natural", quantity: 2, price: 3.2 },
    ],
    total: 20.2,
    status: "paid",
    createdAt: "2026-09-28T18:20:00",
  },
  {
    id: "ord_04",
    clientName: "María López",
    clientPhone: "+52 55 4567 8901",
    items: [{ name: "Espresso doble", quantity: 1, price: 2.0 }],
    total: 2.0,
    status: "delivered",
    createdAt: "2026-09-29T08:05:00",
  },
  {
    id: "ord_05",
    clientName: "Andrés Gutiérrez",
    clientPhone: "+52 55 5678 9012",
    items: [
      { name: "Wrap de pollo", quantity: 1, price: 7.5 },
      { name: "Ensalada césar", quantity: 1, price: 8.0 },
      { name: "Agua mineral", quantity: 2, price: 1.5 },
    ],
    total: 18.5,
    status: "paid",
    createdAt: "2026-09-27T13:30:00",
  },
  {
    id: "ord_06",
    clientName: "Sofía Ramírez",
    clientPhone: "+52 55 6789 0123",
    items: [
      { name: "Brownie con nuez", quantity: 3, price: 3.0 },
      { name: "Chocolate caliente", quantity: 1, price: 3.8 },
    ],
    total: 12.8,
    status: "pending",
    createdAt: "2026-09-29T10:50:00",
  },
];

export const chatHistory: ChatMessage[] = [
  {
    id: "msg_01",
    clientName: "Juan Martínez",
    direction: "inbound",
    text: "Hola, buenos días. Quería reservar una mesa para cuatro personas esta tarde.",
    timestamp: "2026-09-29T09:02:00",
    isVoice: false,
  },
  {
    id: "msg_02",
    clientName: "Aurora",
    direction: "outbound",
    text: "¡Hola, Juan! Con gusto. Tenemos disponibilidad a las 15:00. ¿Te confirmo la reserva para 4 personas a esa hora?",
    timestamp: "2026-09-29T09:03:00",
    isVoice: false,
  },
  {
    id: "msg_03",
    clientName: "Lucía Fernández",
    direction: "inbound",
    text: "Buenas, quiero pedir dos cafés americanos y una tarta de zanahoria para llevar.",
    timestamp: "2026-09-29T11:38:00",
    isVoice: true,
  },
  {
    id: "msg_04",
    clientName: "Aurora",
    direction: "outbound",
    text: "Perfecto, Lucía. Tu pedido suma $9.50. ¿Lo recoges en tienda o prefieres entrega a domicilio?",
    timestamp: "2026-09-29T11:39:00",
    isVoice: false,
  },
  {
    id: "msg_05",
    clientName: "Carlos Mendoza",
    direction: "inbound",
    text: "Oye, ¿todavía tienen mesas disponibles para el sábado por la noche?",
    timestamp: "2026-09-29T12:15:00",
    isVoice: false,
  },
  {
    id: "msg_06",
    clientName: "María López",
    direction: "inbound",
    text: "Es para celebrar un cumpleaños, seríamos unas ocho personas y queríamos saber si pueden preparar un pastel.",
    timestamp: "2026-09-29T13:47:00",
    isVoice: true,
  },
  {
    id: "msg_07",
    clientName: "Aurora",
    direction: "outbound",
    text: "¡Claro que sí, María! Podemos organizar la mesa para ocho y un pastel de chocolate. Te envío el menú de postres.",
    timestamp: "2026-09-29T13:49:00",
    isVoice: false,
  },
  {
    id: "msg_08",
    clientName: "Sofía Ramírez",
    direction: "inbound",
    text: "Gracias por todo, el pedido llegó rapidísimo y estaba delicioso.",
    timestamp: "2026-09-29T14:20:00",
    isVoice: true,
  },
];

export const activity: ActivityItem[] = [
  {
    id: "act_01",
    type: "appointment",
    description: "Nueva reserva de Juan Martínez a las 15:00",
    timestamp: "2026-09-29T09:05:00",
  },
  {
    id: "act_02",
    type: "order",
    description: "Pedido recibido de Lucía Fernández por $9.50",
    timestamp: "2026-09-29T11:40:00",
  },
  {
    id: "act_03",
    type: "message",
    description: "Nota de voz transcrita de María López",
    timestamp: "2026-09-29T13:47:00",
  },
  {
    id: "act_04",
    type: "appointment",
    description: "Reserva de Lucía Fernández confirmada para las 20:30",
    timestamp: "2026-09-29T10:12:00",
  },
  {
    id: "act_05",
    type: "order",
    description: "Pedido de Sofía Ramírez marcado como pendiente",
    timestamp: "2026-09-29T10:50:00",
  },
  {
    id: "act_06",
    type: "message",
    description: "Mensaje de voz transcrito de Carlos Mendoza",
    timestamp: "2026-09-29T08:30:00",
  },
];
