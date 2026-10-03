/**
 * The demo kitchen's customers and commercial set-up: price tiers, the menu, companies and
 * extra staff. Company domains use the reserved ".example" top-level domain, so no real
 * company's emails are used. Delivery times are minutes since midnight.
 */

export interface TierSeed {
  name: string;
  description: string;
  ruleBasis: 'NONE' | 'COST' | 'TIER';
  baseTier?: string;
  multiplierBps?: number;
  /** Prices typed in on this tier, by dish SKU / option name (overrides on derived tiers). */
  dishPrices?: Record<string, number>;
  optionPrices?: Record<string, number>;
}

/** Standard comes first: it is the default, and other tiers derive from it. */
export const TIERS: TierSeed[] = [
  { name: 'Standard', description: 'List prices', ruleBasis: 'NONE' },
  {
    name: 'Enterprise',
    description: 'Large accounts: list prices less 10%',
    ruleBasis: 'TIER',
    baseTier: 'Standard',
    multiplierBps: 9_000,
    // A negotiated price that overrides the rule.
    dishPrices: { 'FL-BRY-01': 425 },
  },
  {
    name: 'Premium',
    description: 'Small offices: list prices plus 15%',
    ruleBasis: 'TIER',
    baseTier: 'Standard',
    multiplierBps: 11_500,
  },
  {
    name: 'Partner',
    description: 'Partner businesses: cost x 2.4',
    ruleBasis: 'COST',
    multiplierBps: 24_000,
  },
  {
    // Typed in only, with gaps on purpose: everything without a price here is hidden from
    // the menus of companies on this tier.
    name: 'Wellness',
    description: 'Health-focused menu: only the dishes priced here are offered',
    ruleBasis: 'NONE',
    dishPrices: {
      'FL-BWL-01': 349,
      'FL-BWL-04': 449,
      'FL-SLD-01': 429,
      'FL-SLD-02': 399,
      'FL-SLD-03': 429,
      'FL-BFT-02': 249,
      'FL-DST-04': 179,
    },
    optionPrices: {
      'Tofu tikka': 179,
      'Chickpea masala': 99,
      Rajma: 99,
      'Brown rice': 39,
      Quinoa: 89,
      'Kachumber salad': 39,
      'Mint chutney': 0,
      Mild: 0,
      Medium: 0,
      Spicy: 0,
    },
  },
];

export interface CategorySeed {
  name: string;
  description: string;
  skus: string[];
  isSecret?: boolean;
  isActive?: boolean;
}

export const MENU: CategorySeed[] = [
  {
    name: 'Bowls',
    description: 'Build your own, or pick a favourite',
    skus: ['FL-BWL-01', 'FL-BWL-02', 'FL-BWL-03', 'FL-BWL-04', 'FL-BWL-05'],
  },
  {
    name: 'Thalis',
    description: 'A complete meal on one plate',
    skus: ['FL-THL-01', 'FL-THL-02', 'FL-THL-03', 'FL-THL-04'],
  },
  {
    name: 'Biryani',
    description: 'Slow-cooked dum biryanis',
    skus: ['FL-BRY-01', 'FL-BRY-02', 'FL-BRY-03'],
  },
  {
    name: 'Curries & rice',
    description: 'Home-style curries',
    skus: ['FL-CRY-01', 'FL-CRY-02', 'FL-CRY-03'],
  },
  {
    name: 'Breakfast',
    description: 'For early meetings',
    skus: ['FL-BFT-01', 'FL-BFT-02', 'FL-BFT-03', 'FL-BFT-04', 'FL-BFT-05'],
  },
  {
    name: 'Wraps & rolls',
    description: 'Easy to eat at a desk',
    skus: ['FL-WRP-01', 'FL-WRP-02', 'FL-WRP-03'],
  },
  {
    // The chole quinoa bowl is also under Bowls: the same dish can sit in several categories.
    name: 'Salads',
    description: 'Fresh and light',
    skus: ['FL-SLD-01', 'FL-SLD-02', 'FL-SLD-03', 'FL-BWL-04'],
  },
  {
    name: 'Tandoor platters',
    description: 'For team lunches',
    skus: ['FL-TND-01', 'FL-TND-02'],
  },
  {
    name: 'Desserts',
    description: 'Something sweet',
    skus: ['FL-DST-01', 'FL-DST-02', 'FL-DST-03', 'FL-DST-04', 'FL-DRK-01'],
  },
  {
    name: "Chef's specials",
    description: 'Off-menu favourites, shared by link',
    skus: ['FL-BRY-02', 'FL-TND-01'],
    isSecret: true,
  },
  {
    name: 'Festive specials',
    description: 'Back for Diwali',
    skus: ['FL-DST-03'],
    isActive: false,
  },
];

/** Staff who are not reviewer accounts. They have no password, so nobody signs in as them. */
export const EXTRA_STAFF = [
  {
    name: 'Arjun Pawar',
    email: 'arjun.pawar@fernleaf.example',
    roleKey: 'driver',
    phone: '+91 98220 41871',
  },
  {
    name: 'Sunil Yadav',
    email: 'sunil.yadav@fernleaf.example',
    roleKey: 'driver',
    phone: '+91 97300 55210',
  },
  {
    name: 'Imran Shaikh',
    email: 'imran.shaikh@fernleaf.example',
    roleKey: 'driver',
    phone: '+91 99600 13874',
  },
  {
    name: 'Lakshmi Menon',
    email: 'lakshmi.menon@fernleaf.example',
    roleKey: 'kitchen',
    phone: null,
  },
] as const;

export interface CompanySeed {
  name: string;
  domains: string[];
  tier: string | null;
  workingDays: number[];
  deliveryTime: number;
  leadMinutes: number;
  packaging: string;
  driverEmail: string;
  driverInstructions: string;
  billing: { contact: string; local: string; phone: string; address: string };
  addresses: {
    label: string;
    line1: string;
    line2?: string;
    city: string;
    postcode: string;
    instructions?: string;
  }[];
  holidays?: { date: string; name: string }[];
  hiddenCategories?: string[];
  /** [category name, dish SKU]: hide that dish in that category only. */
  hiddenItems?: [string, string][];
  employees: number;
  isActive?: boolean;
}

const MON_FRI = [1, 2, 3, 4, 5];
const MON_SAT = [1, 2, 3, 4, 5, 6];
const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];

export const COMPANIES: CompanySeed[] = [
  {
    name: 'Zephyr Labs',
    domains: ['zephyrlabs.example'],
    tier: 'Enterprise',
    workingDays: MON_FRI,
    deliveryTime: 750,
    leadMinutes: 60,
    packaging: 'Eco box (compostable)',
    driverEmail: 'driver@test.com',
    driverInstructions: 'Deliver to the 4th-floor pantry. Reception has the lift access card.',
    billing: {
      contact: 'Meghna Kulkarni',
      local: 'accounts',
      phone: '+91 20 6710 2200',
      address: 'Pride Icon, Baner Road, Pune 411045',
    },
    addresses: [
      {
        label: 'Baner HQ',
        line1: 'Pride Icon, Baner Road',
        line2: '4th floor',
        city: 'Pune',
        postcode: '411045',
        instructions: 'Use the service lift behind the cafe.',
      },
      {
        label: 'Hinjewadi campus',
        line1: 'Phase 2, Rajiv Gandhi Infotech Park',
        city: 'Pune',
        postcode: '411057',
      },
    ],
    hiddenItems: [['Biryani', 'FL-BRY-03']],
    employees: 32,
  },
  {
    name: 'Bluepeak Finance',
    domains: ['bluepeak.example', 'bluepeakcapital.example'],
    tier: 'Premium',
    workingDays: MON_SAT,
    deliveryTime: 780,
    leadMinutes: 45,
    packaging: 'Steel tiffin (returnable)',
    driverEmail: 'arjun.pawar@fernleaf.example',
    driverInstructions: 'Collect yesterday’s tiffins from the mailroom.',
    billing: {
      contact: 'Rohit Bhatia',
      local: 'payables',
      phone: '+91 20 6602 9100',
      address: 'Business Bay, Kalyani Nagar, Pune 411006',
    },
    addresses: [
      {
        label: 'Kalyani Nagar office',
        line1: 'Business Bay, Airport Road',
        line2: 'Tower A, 7th floor',
        city: 'Pune',
        postcode: '411006',
      },
    ],
    hiddenCategories: ['Desserts'],
    employees: 28,
  },
  {
    name: 'Orbit Logistics',
    domains: ['orbitlogistics.example'],
    tier: null,
    workingDays: EVERY_DAY,
    deliveryTime: 720,
    leadMinutes: 60,
    packaging: 'Insulated bag',
    driverEmail: 'driver@test.com',
    driverInstructions: 'Round-the-clock support centre: hand over at the security desk, gate 2.',
    billing: {
      contact: 'Farah Siddiqui',
      local: 'finance',
      phone: '+91 2135 662 400',
      address: 'Plot 14, MIDC Chakan, Pune 410501',
    },
    addresses: [
      {
        label: 'Chakan operations centre',
        line1: 'Plot 14, MIDC Chakan',
        city: 'Pune',
        postcode: '410501',
        instructions: 'Gate 2. Drivers need to show the delivery slip.',
      },
    ],
    holidays: [{ date: '2026-10-09', name: 'Annual offsite' }],
    employees: 34,
  },
  {
    name: 'Greenfield Health',
    domains: ['greenfieldhealth.example'],
    tier: 'Wellness',
    workingDays: MON_FRI,
    deliveryTime: 765,
    leadMinutes: 60,
    packaging: 'Eco box (compostable)',
    driverEmail: 'sunil.yadav@fernleaf.example',
    driverInstructions: 'Clinic entrance is for patients - use the staff door on the left.',
    billing: {
      contact: 'Dr. Anita Joshi',
      local: 'admin',
      phone: '+91 20 6644 1180',
      address: 'Viman Nagar, Pune 411014',
    },
    addresses: [
      {
        label: 'Viman Nagar HQ',
        line1: 'Symbiosis Road, Viman Nagar',
        city: 'Pune',
        postcode: '411014',
      },
    ],
    employees: 26,
  },
  {
    name: 'Nimbus Design Studio',
    domains: ['nimbusdesign.example'],
    tier: null,
    workingDays: MON_FRI,
    deliveryTime: 810,
    leadMinutes: 30,
    packaging: 'Eco box (compostable)',
    driverEmail: 'sunil.yadav@fernleaf.example',
    driverInstructions: 'Studio is on the terrace; ring the bell twice.',
    billing: {
      contact: 'Kabir Sen',
      local: 'studio',
      phone: '+91 20 2553 7781',
      address: 'Lane 6, Koregaon Park, Pune 411001',
    },
    addresses: [
      {
        label: 'Koregaon Park studio',
        line1: 'Lane 6, North Main Road',
        line2: 'Terrace floor',
        city: 'Pune',
        postcode: '411001',
      },
    ],
    hiddenCategories: ['Tandoor platters'],
    hiddenItems: [['Wraps & rolls', 'FL-WRP-02']],
    employees: 18,
  },
  {
    name: 'Kestrel Pharma',
    domains: ['kestrelpharma.example'],
    tier: 'Partner',
    workingDays: MON_SAT,
    deliveryTime: 735,
    leadMinutes: 75,
    packaging: 'Insulated bag',
    driverEmail: 'imran.shaikh@fernleaf.example',
    driverInstructions: 'No food past the airlock - leave boxes at the canteen counter.',
    billing: {
      contact: 'Sanjay Deshpande',
      local: 'procurement',
      phone: '+91 20 6712 4400',
      address: 'Hinjewadi Phase 1, Pune 411057',
    },
    addresses: [
      { label: 'R&D centre', line1: 'Hinjewadi Phase 1', city: 'Pune', postcode: '411057' },
      {
        label: 'Ranjangaon plant office',
        line1: 'MIDC Ranjangaon',
        city: 'Pune',
        postcode: '412220',
      },
    ],
    employees: 36,
  },
  {
    name: 'Sahyadri Consulting',
    domains: ['sahyadriconsulting.example'],
    tier: 'Enterprise',
    workingDays: MON_FRI,
    deliveryTime: 750,
    leadMinutes: 60,
    packaging: 'Eco box (compostable)',
    driverEmail: 'imran.shaikh@fernleaf.example',
    driverInstructions: '',
    billing: {
      contact: 'Pooja Rane',
      local: 'accounts',
      phone: '+91 20 2612 9988',
      address: 'Senapati Bapat Road, Pune 411016',
    },
    addresses: [
      {
        label: 'SB Road office',
        line1: 'ICC Trade Tower, Senapati Bapat Road',
        city: 'Pune',
        postcode: '411016',
      },
    ],
    holidays: [{ date: '2026-10-12', name: 'Founders’ day' }],
    employees: 30,
  },
  {
    name: 'Lotus Retail',
    domains: ['lotusretail.example'],
    tier: null,
    workingDays: MON_FRI,
    deliveryTime: 780,
    leadMinutes: 90,
    packaging: 'Steel tiffin (returnable)',
    driverEmail: 'arjun.pawar@fernleaf.example',
    driverInstructions: 'Head office is above the flagship store; enter from the side lane.',
    billing: {
      contact: 'Neeraj Gupta',
      local: 'accounts',
      phone: '+91 20 2445 6610',
      address: 'FC Road, Shivajinagar, Pune 411004',
    },
    addresses: [
      {
        label: 'Head office',
        line1: 'FC Road, Shivajinagar',
        line2: '2nd floor',
        city: 'Pune',
        postcode: '411004',
      },
    ],
    employees: 24,
  },
  {
    // A company that left: switched off, kept for its order history.
    name: 'Copperleaf Media',
    domains: ['copperleafmedia.example'],
    tier: null,
    workingDays: MON_FRI,
    deliveryTime: 780,
    leadMinutes: 60,
    packaging: 'Eco box (compostable)',
    driverEmail: 'arjun.pawar@fernleaf.example',
    driverInstructions: '',
    billing: {
      contact: 'Ira Chatterjee',
      local: 'accounts',
      phone: '+91 20 2565 3300',
      address: 'Aundh, Pune 411007',
    },
    addresses: [
      { label: 'Aundh office', line1: 'ITI Road, Aundh', city: 'Pune', postcode: '411007' },
    ],
    employees: 8,
    isActive: false,
  },
];

export const FIRST_NAMES = [
  'Aarav',
  'Ananya',
  'Rohan',
  'Kavya',
  'Arjun',
  'Sneha',
  'Vivek',
  'Ishita',
  'Karan',
  'Priyanka',
  'Aditya',
  'Neha',
  'Siddharth',
  'Pooja',
  'Rahul',
  'Divya',
  'Nikhil',
  'Shreya',
  'Varun',
  'Tanvi',
  'Harsh',
  'Meera',
  'Kunal',
  'Riya',
  'Amit',
  'Sana',
  'Yash',
  'Nandini',
  'Manish',
  'Aisha',
  'Gaurav',
  'Pallavi',
  'Abhishek',
  'Ritika',
  'Sameer',
  'Fatima',
  'Omkar',
  'Gayatri',
  'Tushar',
  'Zoya',
];

export const LAST_NAMES = [
  'Sharma',
  'Iyer',
  'Mehta',
  'Reddy',
  'Kapoor',
  'Patil',
  'Nair',
  'Bose',
  'Malhotra',
  'Joshi',
  'Kulkarni',
  'Deshmukh',
  'Gupta',
  'Rao',
  'Banerjee',
  'Pillai',
  'Chauhan',
  'Shah',
  'Menon',
  'Verma',
  'Khan',
  'Saxena',
  'Gokhale',
  'Fernandes',
  'Mishra',
  'Agarwal',
  'Pandey',
  'Sinha',
  'Bhat',
  'Desai',
];

/** A kitchen holiday after the review window: visible in Settings, harmless to the demo. */
export const KITCHEN_HOLIDAYS = [{ date: '2026-11-09', name: 'Diwali break' }];
