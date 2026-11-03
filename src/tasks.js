// Errands a walk can include, mapped to OpenStreetMap tags.
const any = (v, list) => list.includes(v);

export const TASKS = {
  chai: {
    label: 'Chai / coffee', emoji: '☕',
    match: (t) => t.amenity === 'cafe' || any(t.shop, ['tea', 'coffee']),
  },
  groceries: {
    label: 'Groceries', emoji: '🛒',
    match: (t) => any(t.shop, ['supermarket', 'convenience', 'grocery', 'general']),
  },
  vegetables: {
    label: 'Fruits & vegetables', emoji: '🥬',
    match: (t) => any(t.shop, ['greengrocer', 'farm']) || t.amenity === 'marketplace',
  },
  pharmacy: {
    label: 'Pharmacy', emoji: '💊',
    match: (t) => t.amenity === 'pharmacy' || t.shop === 'chemist',
  },
  atm: {
    label: 'ATM / bank', emoji: '🏧',
    match: (t) => any(t.amenity, ['atm', 'bank']),
  },
  post: {
    label: 'Post office', emoji: '📮',
    match: (t) => t.amenity === 'post_office',
  },
  bakery: {
    label: 'Bakery / sweets', emoji: '🥐',
    match: (t) => any(t.shop, ['bakery', 'confectionery', 'pastry']),
  },
  snack: {
    label: 'Snack / meal', emoji: '🍛',
    match: (t) => any(t.amenity, ['fast_food', 'restaurant', 'ice_cream', 'food_court']),
  },
  temple: {
    label: 'Temple / place of worship', emoji: '🛕',
    match: (t) => t.amenity === 'place_of_worship',
  },
  park: {
    label: 'Sit in a park', emoji: '🌳',
    match: (t) => any(t.leisure, ['park', 'garden']),
  },
  books: {
    label: 'Books / stationery', emoji: '📚',
    match: (t) => any(t.shop, ['books', 'stationery']) || t.amenity === 'library',
  },
};

export const MOODS = {
  calm: {
    label: 'Calm', emoji: '😌', blurb: 'Quiet lanes and greenery, avoid busy roads at all costs',
    walk: 4.0, green: 0.45, interest: 0.0,
  },
  explore: {
    label: 'Curious', emoji: '🧭', blurb: 'Lively streets with shops and things to discover',
    walk: 2.5, green: 0.15, interest: 0.35,
  },
  errands: {
    label: 'Get things done', emoji: '✅', blurb: 'Efficient route through your errands, still avoiding the worst roads',
    walk: 1.2, green: 0.0, interest: 0.0,
  },
};
