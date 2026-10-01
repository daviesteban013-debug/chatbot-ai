/**
 * Datos geográficos de Colombia para validación de direcciones de envío.
 * Mapa de departamentos -> ciudades principales, con helpers de validación
 * y normalización (case-insensitive) usados por las tools del agente.
 */

export const COLOMBIA_GEO: Record<string, string[]> = {
  'Amazonas': ['Leticia', 'Puerto Nariño'],
  'Antioquia': ['Medellín', 'Bello', 'Itagüí', 'Envigado', 'Rionegro', 'Apartadó', 'Turbo'],
  'Arauca': ['Arauca', 'Tame', 'Saravena'],
  'Atlántico': ['Barranquilla', 'Soledad', 'Malambo', 'Puerto Colombia', 'Sabanalarga'],
  'Bogotá D.C.': ['Bogotá'],
  'Bolívar': ['Cartagena', 'Magangué', 'Turbaco'],
  'Boyacá': ['Tunja', 'Duitama', 'Sogamoso', 'Chiquinquirá'],
  'Caldas': ['Manizales', 'Villamaría', 'La Dorada'],
  'Caquetá': ['Florencia', 'San Vicente del Caguán'],
  'Casanare': ['Yopal', 'Aguazul', 'Villanueva'],
  'Cauca': ['Popayán', 'Santander de Quilichao'],
  'Cesar': ['Valledupar', 'Aguachica', 'Bosconia'],
  'Chocó': ['Quibdó', 'Istmina'],
  'Córdoba': ['Montería', 'Cereté', 'Lorica', 'Sahagún'],
  'Cundinamarca': ['Soacha', 'Zipaquirá', 'Chía', 'Facatativá', 'Fusagasugá', 'Girardot', 'Mosquera', 'Madrid'],
  'Guainía': ['Inírida'],
  'Guaviare': ['San José del Guaviare'],
  'Huila': ['Neiva', 'Pitalito', 'Garzón'],
  'La Guajira': ['Riohacha', 'Maicao', 'Uribia'],
  'Magdalena': ['Santa Marta', 'Ciénaga', 'Fundación', 'El Banco'],
  'Meta': ['Villavicencio', 'Acacías', 'Granada'],
  'Nariño': ['Pasto', 'Ipiales', 'Tumaco'],
  'Norte de Santander': ['Cúcuta', 'Ocaña', 'Pamplona'],
  'Putumayo': ['Mocoa', 'Puerto Asís'],
  'Quindío': ['Armenia', 'Calarcá', 'Montenegro'],
  'Risaralda': ['Pereira', 'Dosquebradas', 'Santa Rosa de Cabal'],
  'San Andrés y Providencia': ['San Andrés'],
  'Santander': ['Bucaramanga', 'Floridablanca', 'Girón', 'Piedecuesta', 'Barrancabermeja'],
  'Sucre': ['Sincelejo', 'Corozal', 'Sampués'],
  'Tolima': ['Ibagué', 'Espinal', 'Melgar', 'Mariquita'],
  'Valle del Cauca': ['Cali', 'Palmira', 'Buenaventura', 'Tuluá', 'Cartago', 'Jamundí'],
  'Vaupés': ['Mitú'],
  'Vichada': ['Puerto Carreño'],
}

/** Indica si el departamento existe en el listado (case-insensitive). */
export function isValidDepartment(dept: string): boolean {
  return Object.keys(COLOMBIA_GEO).some(d => d.toLowerCase() === dept.toLowerCase())
}

/** Indica si la ciudad pertenece al departamento indicado (case-insensitive). */
export function isValidCity(dept: string, city: string): boolean {
  const key = Object.keys(COLOMBIA_GEO).find(d => d.toLowerCase() === dept.toLowerCase())
  if (!key) return false
  return COLOMBIA_GEO[key].some(c => c.toLowerCase() === city.toLowerCase())
}

/** Devuelve el nombre canónico del departamento o `null` si no existe. */
export function normalizeDepartment(dept: string): string | null {
  return Object.keys(COLOMBIA_GEO).find(d => d.toLowerCase() === dept.toLowerCase()) || null
}

/** Devuelve el nombre canónico de la ciudad dentro del departamento o `null`. */
export function normalizeCity(dept: string, city: string): string | null {
  const key = normalizeDepartment(dept)
  if (!key) return null
  return COLOMBIA_GEO[key].find(c => c.toLowerCase() === city.toLowerCase()) || null
}
