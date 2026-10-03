/**
 * The demo kitchen's catalogue: reference lists, reusable options and dishes. Names are
 * the natural keys the seed uses to find what already exists. Money is in cents.
 */

export const REFERENCE_LISTS = {
  allergens: ['Dairy', 'Gluten', 'Nuts', 'Peanuts', 'Soy', 'Sesame', 'Mustard', 'Egg'],
  dietaryTags: ['Vegetarian', 'Vegan', 'Jain', 'Gluten-free', 'High protein'],
  kitchenStations: [
    'Tandoor',
    'Curry & dal',
    'Rice & biryani',
    'Bowls & salads',
    'South Indian',
    'Breads & wraps',
    'Desserts',
  ],
  portionSizes: ['Regular', 'Large'],
  packagingTypes: ['Eco box (compostable)', 'Steel tiffin (returnable)', 'Insulated bag'],
};

export interface OptionSeed {
  name: string;
  costCents: number;
  /** Price on the Standard (default) tier. */
  standardCents: number;
  allergens?: string[];
  tags?: string[];
  /** [size, extra charge] for options sold in sizes. */
  portions?: [string, number][];
}

const VEG = ['Vegetarian'];
const VEGAN = ['Vegetarian', 'Vegan'];

export const OPTIONS: OptionSeed[] = [
  // Proteins
  {
    name: 'Paneer tikka',
    costCents: 80,
    standardCents: 199,
    allergens: ['Dairy'],
    tags: [...VEG, 'High protein'],
  },
  {
    name: 'Tofu tikka',
    costCents: 70,
    standardCents: 179,
    allergens: ['Soy'],
    tags: [...VEGAN, 'High protein'],
  },
  { name: 'Chickpea masala', costCents: 35, standardCents: 99, tags: [...VEGAN, 'Gluten-free'] },
  { name: 'Rajma', costCents: 35, standardCents: 99, tags: [...VEGAN, 'Gluten-free'] },
  {
    name: 'Soya chunks',
    costCents: 40,
    standardCents: 129,
    allergens: ['Soy'],
    tags: [...VEGAN, 'High protein'],
  },
  {
    name: 'Chicken tikka',
    costCents: 110,
    standardCents: 249,
    allergens: ['Dairy'],
    tags: ['High protein'],
  },
  {
    name: 'Egg bhurji',
    costCents: 50,
    standardCents: 149,
    allergens: ['Egg'],
    tags: ['High protein'],
  },
  // Rice, sold in sizes
  {
    name: 'Jeera rice',
    costCents: 20,
    standardCents: 0,
    tags: [...VEGAN, 'Gluten-free'],
    portions: [
      ['Regular', 0],
      ['Large', 40],
    ],
  },
  {
    name: 'Brown rice',
    costCents: 25,
    standardCents: 49,
    tags: [...VEGAN, 'Gluten-free'],
    portions: [
      ['Regular', 0],
      ['Large', 45],
    ],
  },
  {
    name: 'Quinoa',
    costCents: 45,
    standardCents: 99,
    tags: [...VEGAN, 'Gluten-free'],
    portions: [
      ['Regular', 0],
      ['Large', 60],
    ],
  },
  // Breads
  {
    name: 'Butter naan',
    costCents: 18,
    standardCents: 49,
    allergens: ['Dairy', 'Gluten'],
    tags: VEG,
  },
  { name: 'Tandoori roti', costCents: 8, standardCents: 0, allergens: ['Gluten'], tags: VEGAN },
  { name: 'Missi roti', costCents: 12, standardCents: 39, allergens: ['Gluten'], tags: VEG },
  {
    name: 'Phulka (2 pcs)',
    costCents: 8,
    standardCents: 0,
    allergens: ['Gluten'],
    tags: [...VEGAN, 'Jain'],
  },
  // Sides
  {
    name: 'Boondi raita',
    costCents: 18,
    standardCents: 59,
    allergens: ['Dairy', 'Gluten'],
    tags: VEG,
  },
  { name: 'Mint chutney', costCents: 5, standardCents: 0, tags: [...VEGAN, 'Gluten-free', 'Jain'] },
  { name: 'Kachumber salad', costCents: 15, standardCents: 49, tags: [...VEGAN, 'Gluten-free'] },
  { name: 'Papad', costCents: 8, standardCents: 29, tags: VEGAN },
  // Spice level - every option is chosen (spec §5), so even "Mild" is an option
  { name: 'Mild', costCents: 0, standardCents: 0, tags: [...VEGAN, 'Gluten-free'] },
  { name: 'Medium', costCents: 0, standardCents: 0, tags: [...VEGAN, 'Gluten-free'] },
  { name: 'Spicy', costCents: 0, standardCents: 0, tags: [...VEGAN, 'Gluten-free'] },
];

export interface GroupSeed {
  name: string;
  isRequired: boolean;
  maxSelections: number;
  /** Portioned groups only. */
  sizes?: string[];
  options: string[];
}

const PROTEIN: GroupSeed = {
  name: 'Choose your protein',
  isRequired: true,
  maxSelections: 1,
  options: [
    'Paneer tikka',
    'Tofu tikka',
    'Chickpea masala',
    'Rajma',
    'Soya chunks',
    'Chicken tikka',
    'Egg bhurji',
  ],
};
const RICE: GroupSeed = {
  name: 'Choose your rice',
  isRequired: true,
  maxSelections: 1,
  sizes: ['Regular', 'Large'],
  options: ['Jeera rice', 'Brown rice', 'Quinoa'],
};
const BREAD: GroupSeed = {
  name: 'Choose your bread',
  isRequired: true,
  maxSelections: 1,
  options: ['Butter naan', 'Tandoori roti', 'Missi roti', 'Phulka (2 pcs)'],
};
const SIDES: GroupSeed = {
  name: 'Add sides',
  isRequired: false,
  maxSelections: 2,
  options: ['Boondi raita', 'Mint chutney', 'Kachumber salad', 'Papad'],
};
const SPICE: GroupSeed = {
  name: 'Spice level',
  isRequired: true,
  maxSelections: 1,
  options: ['Mild', 'Medium', 'Spicy'],
};

export interface DishSeed {
  sku: string;
  name: string;
  description: string;
  temperature: 'HOT' | 'COLD';
  costCents: number;
  /** Price on the Standard tier; null leaves a deliberate gap (the dish is hidden there). */
  standardCents: number | null;
  /** Null routes its prep units to "Unassigned" on the kitchen board. */
  station: string | null;
  allergens?: string[];
  tags?: string[];
  minOrderQuantity?: number;
  groups?: GroupSeed[];
  isActive?: boolean;
}

export const DISHES: DishSeed[] = [
  // Bowls
  {
    sku: 'FL-BWL-01',
    name: 'Build-your-own rice bowl',
    description:
      'Pick a protein, a rice and your sides. With sautéed vegetables and a lemon wedge.',
    temperature: 'HOT',
    costCents: 110,
    standardCents: 349,
    station: 'Bowls & salads',
    groups: [PROTEIN, RICE, SIDES, SPICE],
  },
  {
    sku: 'FL-BWL-02',
    name: 'Paneer tikka bowl',
    description:
      'Charred paneer tikka on your choice of rice, with pickled onions and mint chutney.',
    temperature: 'HOT',
    costCents: 190,
    standardCents: 549,
    station: 'Bowls & salads',
    allergens: ['Dairy'],
    tags: [...VEG, 'High protein'],
    groups: [RICE, SIDES, SPICE],
  },
  {
    sku: 'FL-BWL-03',
    name: 'Rajma chawal bowl',
    description: 'Slow-cooked Kashmiri rajma over rice, with an onion-tomato salad.',
    temperature: 'HOT',
    costCents: 120,
    standardCents: 399,
    station: 'Bowls & salads',
    tags: [...VEGAN, 'Gluten-free'],
    groups: [RICE, SIDES],
  },
  {
    sku: 'FL-BWL-04',
    name: 'Chole quinoa bowl',
    description: 'Amritsari chole on quinoa with cucumber, mint and pomegranate.',
    temperature: 'HOT',
    costCents: 150,
    standardCents: 449,
    station: 'Bowls & salads',
    tags: [...VEGAN, 'Gluten-free', 'High protein'],
    groups: [SIDES, SPICE],
  },
  {
    sku: 'FL-BWL-05',
    name: 'Chicken tikka bowl',
    description: 'Tandoori chicken tikka, rice, kachumber and garlic yoghurt.',
    temperature: 'HOT',
    costCents: 210,
    standardCents: 599,
    station: 'Bowls & salads',
    allergens: ['Dairy'],
    tags: ['High protein'],
    groups: [RICE, SIDES, SPICE],
  },
  // Thalis
  {
    sku: 'FL-THL-01',
    name: 'Executive veg thali',
    description:
      'Dal makhani, paneer butter masala, seasonal sabzi, jeera rice, raita, salad and your bread.',
    temperature: 'HOT',
    costCents: 230,
    standardCents: 649,
    station: 'Curry & dal',
    allergens: ['Dairy', 'Gluten', 'Nuts'],
    tags: VEG,
    groups: [BREAD, SPICE],
  },
  {
    sku: 'FL-THL-02',
    name: 'Jain thali',
    description: 'No onion, no garlic: dal, kadhi, sabzi, rice and phulkas.',
    temperature: 'HOT',
    costCents: 210,
    standardCents: 599,
    station: 'Curry & dal',
    allergens: ['Dairy', 'Gluten'],
    tags: [...VEG, 'Jain'],
    groups: [{ ...BREAD, options: ['Phulka (2 pcs)', 'Tandoori roti'] }],
  },
  {
    sku: 'FL-THL-03',
    name: 'Punjabi chicken thali',
    description: 'Butter chicken, dal, jeera rice, laccha onions, raita and your bread.',
    temperature: 'HOT',
    costCents: 260,
    standardCents: 749,
    station: 'Curry & dal',
    allergens: ['Dairy', 'Gluten', 'Nuts'],
    tags: ['High protein'],
    groups: [BREAD, SPICE],
  },
  {
    sku: 'FL-THL-04',
    name: 'South Indian thali',
    description: 'Sambar, rasam, poriyal, kootu, curd rice and papad.',
    temperature: 'HOT',
    costCents: 200,
    standardCents: 549,
    station: 'South Indian',
    allergens: ['Dairy'],
    tags: VEG,
  },
  // Biryani
  {
    sku: 'FL-BRY-01',
    name: 'Veg dum biryani',
    description:
      'Basmati layered with vegetables, saffron and fried onions, sealed and slow-cooked.',
    temperature: 'HOT',
    costCents: 170,
    standardCents: 499,
    station: 'Rice & biryani',
    allergens: ['Nuts', 'Dairy'],
    tags: VEG,
    groups: [SIDES, SPICE],
  },
  {
    sku: 'FL-BRY-02',
    name: 'Hyderabadi chicken biryani',
    description: 'Kacchi-style chicken biryani with mirchi ka salan.',
    temperature: 'HOT',
    costCents: 230,
    standardCents: 649,
    station: 'Rice & biryani',
    allergens: ['Nuts', 'Dairy', 'Peanuts', 'Sesame'],
    tags: ['High protein'],
    groups: [SIDES, SPICE],
  },
  {
    sku: 'FL-BRY-03',
    name: 'Egg biryani',
    description: 'Fragrant basmati with masala-fried eggs.',
    temperature: 'HOT',
    costCents: 180,
    standardCents: 499,
    station: 'Rice & biryani',
    allergens: ['Egg', 'Dairy'],
    tags: ['High protein'],
    groups: [SIDES, SPICE],
  },
  // Curries & rice
  {
    sku: 'FL-CRY-01',
    name: 'Dal makhani with rice',
    description: 'Black lentils simmered overnight with butter and cream.',
    temperature: 'HOT',
    costCents: 130,
    standardCents: 399,
    station: 'Curry & dal',
    allergens: ['Dairy'],
    tags: [...VEG, 'Gluten-free'],
    groups: [RICE],
  },
  {
    sku: 'FL-CRY-02',
    name: 'Paneer butter masala with bread',
    description: 'Paneer in a silky tomato-cashew gravy.',
    temperature: 'HOT',
    costCents: 170,
    standardCents: 549,
    station: 'Curry & dal',
    allergens: ['Dairy', 'Nuts'],
    tags: VEG,
    groups: [BREAD],
  },
  {
    sku: 'FL-CRY-03',
    name: 'Kadhi chawal',
    description: 'Gujarati-style yoghurt kadhi with pakoras, over steamed rice.',
    temperature: 'HOT',
    costCents: 100,
    standardCents: 349,
    station: 'Curry & dal',
    allergens: ['Dairy', 'Gluten'],
    tags: VEG,
  },
  // Breakfast
  {
    sku: 'FL-BFT-01',
    name: 'Masala dosa',
    description: 'Crisp rice-lentil crepe with potato masala, sambar and coconut chutney.',
    temperature: 'HOT',
    costCents: 90,
    standardCents: 299,
    station: 'South Indian',
    tags: [...VEGAN, 'Gluten-free'],
  },
  {
    sku: 'FL-BFT-02',
    name: 'Idli sambar (4 pcs)',
    description: 'Steamed rice cakes with sambar and two chutneys.',
    temperature: 'HOT',
    costCents: 70,
    standardCents: 249,
    station: 'South Indian',
    tags: [...VEGAN, 'Gluten-free'],
  },
  {
    sku: 'FL-BFT-03',
    name: 'Kanda poha',
    description: 'Flattened rice with onions, peanuts, curry leaves and lemon.',
    temperature: 'HOT',
    costCents: 50,
    standardCents: 199,
    // No station on purpose: its prep units go to "Unassigned" on the kitchen board.
    station: null,
    allergens: ['Peanuts'],
    tags: VEGAN,
  },
  {
    sku: 'FL-BFT-04',
    name: 'Aloo paratha with curd',
    description: 'Two stuffed wholewheat parathas with curd and pickle.',
    temperature: 'HOT',
    costCents: 80,
    standardCents: 279,
    station: 'Breads & wraps',
    allergens: ['Dairy', 'Gluten', 'Mustard'],
    tags: VEG,
  },
  {
    sku: 'FL-BFT-05',
    name: 'Vegetable upma',
    description: 'Semolina cooked with vegetables, mustard seeds and curry leaves.',
    temperature: 'HOT',
    costCents: 50,
    standardCents: 199,
    station: 'South Indian',
    allergens: ['Gluten', 'Mustard'],
    tags: VEGAN,
  },
  // Wraps & rolls
  {
    sku: 'FL-WRP-01',
    name: 'Paneer kathi roll',
    description: 'Paneer tikka, peppers and onions rolled in a flaky paratha.',
    temperature: 'HOT',
    costCents: 110,
    standardCents: 349,
    station: 'Breads & wraps',
    allergens: ['Dairy', 'Gluten'],
    tags: VEG,
  },
  {
    sku: 'FL-WRP-02',
    name: 'Chicken kathi roll',
    description: 'Kolkata-style chicken roll in an egg-coated paratha.',
    temperature: 'HOT',
    costCents: 130,
    standardCents: 399,
    station: 'Breads & wraps',
    allergens: ['Egg', 'Gluten'],
    tags: ['High protein'],
  },
  {
    sku: 'FL-WRP-03',
    name: 'Falafel hummus wrap',
    description: 'Herby falafel, hummus, pickled cucumber and greens.',
    temperature: 'COLD',
    costCents: 120,
    standardCents: 379,
    station: 'Breads & wraps',
    allergens: ['Sesame', 'Gluten'],
    tags: VEGAN,
  },
  // Salads
  {
    sku: 'FL-SLD-01',
    name: 'Quinoa chaat salad',
    description: 'Quinoa, chickpeas, pomegranate and sev with a tamarind-mint dressing.',
    temperature: 'COLD',
    costCents: 140,
    standardCents: 449,
    station: 'Bowls & salads',
    allergens: ['Gluten'],
    tags: VEGAN,
  },
  {
    sku: 'FL-SLD-02',
    name: 'Sprouts and paneer salad',
    description: 'Moong sprouts, grilled paneer, cucumber and a lemon dressing.',
    temperature: 'COLD',
    costCents: 120,
    standardCents: 399,
    station: 'Bowls & salads',
    allergens: ['Dairy'],
    tags: [...VEG, 'Gluten-free', 'High protein'],
  },
  {
    sku: 'FL-SLD-03',
    name: 'Mediterranean chickpea salad',
    description: 'Chickpeas, olives, tomato, herbed tofu and greens.',
    temperature: 'COLD',
    costCents: 130,
    standardCents: 429,
    station: 'Bowls & salads',
    allergens: ['Soy'],
    tags: [...VEGAN, 'Gluten-free'],
  },
  // Tandoor platters
  {
    sku: 'FL-TND-01',
    name: 'Tandoori paneer platter (serves 4)',
    description: 'Paneer and vegetable tikka with mint chutney and onions. For team lunches.',
    temperature: 'HOT',
    costCents: 600,
    standardCents: 1899,
    station: 'Tandoor',
    allergens: ['Dairy'],
    tags: [...VEG, 'Gluten-free'],
    minOrderQuantity: 2,
  },
  {
    sku: 'FL-TND-02',
    name: 'Tandoori chicken (half)',
    description: 'Half a chicken marinated overnight and charred in the tandoor.',
    temperature: 'HOT',
    costCents: 220,
    // Deliberately no Standard price: it shows up under "No price" on the Standard tier grid
    // and is hidden from menus priced on Standard.
    standardCents: null,
    station: 'Tandoor',
    allergens: ['Dairy'],
    tags: ['High protein', 'Gluten-free'],
  },
  // Desserts
  {
    sku: 'FL-DST-01',
    name: 'Gulab jamun (2 pcs)',
    description: 'Warm milk dumplings in cardamom syrup.',
    temperature: 'HOT',
    costCents: 35,
    standardCents: 149,
    station: 'Desserts',
    allergens: ['Dairy', 'Gluten'],
    tags: VEG,
  },
  {
    sku: 'FL-DST-02',
    name: 'Mango shrikhand',
    description: 'Strained yoghurt with Alphonso mango and saffron.',
    temperature: 'COLD',
    costCents: 45,
    standardCents: 179,
    station: 'Desserts',
    allergens: ['Dairy'],
    tags: [...VEG, 'Gluten-free'],
  },
  {
    sku: 'FL-DST-03',
    name: 'Rasmalai (2 pcs)',
    description: 'Soft paneer discs in saffron milk with pistachios.',
    temperature: 'COLD',
    costCents: 60,
    standardCents: 229,
    station: 'Desserts',
    allergens: ['Dairy', 'Nuts'],
    tags: [...VEG, 'Gluten-free'],
  },
  {
    sku: 'FL-DST-04',
    name: 'Fresh fruit bowl',
    description: 'Seasonal cut fruit with chaat masala and lime.',
    temperature: 'COLD',
    costCents: 50,
    standardCents: 199,
    station: 'Desserts',
    tags: [...VEGAN, 'Gluten-free', 'Jain'],
  },
  {
    sku: 'FL-DRK-01',
    name: 'Mango lassi',
    description: 'Switched off until mangoes are back in season.',
    temperature: 'COLD',
    costCents: 40,
    standardCents: 179,
    station: 'Desserts',
    allergens: ['Dairy'],
    tags: [...VEG, 'Gluten-free'],
    isActive: false,
  },
];
