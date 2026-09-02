export type MenuItem = {
  id: string;
  name: string;
  nameKo: string;
  price: number;
  category: "pizza" | "taco" | "bibimbap";
};

export type CartItem = {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
};

export type Store = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export type OrderState = {
  cart: CartItem[];
  location?: { lat: number; lng: number };
  orderId?: string;
};

export const MENU: MenuItem[] = [
  {
    id: "pepperoni-large",
    name: "Large Pepperoni Pizza",
    nameKo: "라지 페퍼로니",
    price: 18000,
    category: "pizza",
  },
  {
    id: "margherita-medium",
    name: "Medium Margherita Pizza",
    nameKo: "미디엄 마르게리타",
    price: 15000,
    category: "pizza",
  },
  {
    id: "beef-taco-set",
    name: "Beef Taco Set (3)",
    nameKo: "비프 타코 세트",
    price: 12000,
    category: "taco",
  },
  {
    id: "chicken-taco-set",
    name: "Chicken Taco Set (3)",
    nameKo: "치킨 타코 세트",
    price: 11000,
    category: "taco",
  },
  {
    id: "classic-bibimbap",
    name: "Classic Bibimbap",
    nameKo: "전통 비빔밥",
    price: 10000,
    category: "bibimbap",
  },
  {
    id: "bulgogi-bibimbap",
    name: "Bulgogi Bibimbap",
    nameKo: "불고기 비빔밥",
    price: 12000,
    category: "bibimbap",
  },
];

export const STORES: Store[] = [
  { id: "gangnam", name: "강남점", lat: 37.4979, lng: 127.0276 },
  { id: "hongdae", name: "홍대점", lat: 37.5563, lng: 126.922 },
  { id: "jamsil", name: "잠실점", lat: 37.5133, lng: 127.1028 },
];

export function createInitialOrderState(): OrderState {
  return { cart: [] };
}

export function findMenuItem(query: string): MenuItem | undefined {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return undefined;

  return MENU.find(
    (item) =>
      item.id === normalized ||
      item.name.toLowerCase() === normalized ||
      item.nameKo === query.trim() ||
      item.name.toLowerCase().includes(normalized) ||
      item.nameKo.includes(query.trim()),
  );
}

export function cartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestStore(lat: number, lng: number) {
  let closest = STORES[0]!;
  let distanceKm = haversineKm(lat, lng, closest.lat, closest.lng);

  for (const store of STORES.slice(1)) {
    const nextDistance = haversineKm(lat, lng, store.lat, store.lng);
    if (nextDistance < distanceKm) {
      closest = store;
      distanceKm = nextDistance;
    }
  }

  return {
    store: closest,
    distanceKm: Math.round(distanceKm * 10) / 10,
  };
}

export function addItemToCart(
  cart: CartItem[],
  item: MenuItem,
  quantity: number,
): CartItem[] {
  const next = [...cart];
  const existing = next.find((line) => line.itemId === item.id);

  if (existing) {
    existing.quantity += quantity;
    return next;
  }

  next.push({
    itemId: item.id,
    name: item.nameKo,
    price: item.price,
    quantity,
  });

  return next;
}
