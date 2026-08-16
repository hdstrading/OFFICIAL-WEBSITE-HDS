import type { Product, Service } from '../types.js';

export const PRODUCTS: Product[] = [
  {
    id: 'prod-luxe-san',
    sku: 'HDS-LUXE-SAN',
    name: 'Luxe-San Hospital-Grade Disinfectant Concentrate',
    category: 'hygiene_care',
    subcategory: 'Sanitation Chemicals',
    description: 'An ultra-concentrated, broad-spectrum quaternary ammonium sanitizer. Certified against healthcarepathogens while emitting a natural botanical scent designed for luxurious resort lobbies and clinical facilities.',
    price: 4850,
    unit: '20L Carboy',
    image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&q=80&w=600',
    features: [
      'Dilution ratio of 1:120 offering immense economy',
      'Kills 99.999% of bacteria, viruses, and fungi in 60 seconds',
      'Non-corrosive formula safe for premium marble, granite, and brass fittings',
      'Biodegradable active ingredients with zero VOC residues'
    ],
    specs: {
      'pH Level': '7.2 (Neutral)',
      'Active Agent': 'Quaternary Ammonium Compound (Gen IV)',
      'Fragrance Profile': 'French Lavender & Wild Bamboo',
      'Certification': 'FDA Approved, Green Label Certified'
    },
    isBulkEligible: true,
    minBulkQty: 5,
    // Website-authored, so listed and not stock-tracked until the
    // inventory system takes ownership of the item by SKU.
    isListed: true,
    stockTracked: false,
    stockAvailable: null,
  },
  {
    id: 'prod-aqua-chlorine',
    sku: 'HDS-AQUA-CHLORINE',
    name: 'Crystal-Pool 90% Trichlor Chlorine Tablets',
    category: 'pool_care',
    subcategory: 'Pool Treatment',
    description: 'Premium slow-dissolving 3-inch organic chlorine tablets. Formulated with built-in UV stabilizers to withstand tropical midday sun, keeping resort/hotel swimming pools sparkling clear without frequent treatment.',
    price: 12500,
    unit: '50kg Industrial Drum',
    image: 'https://images.unsplash.com/photo-1544411047-c491574aaf2d?auto=format&fit=crop&q=80&w=600',
    features: [
      '90% available active chlorine for maximum biological reduction',
      'Sun-shield Cyanuric Acid additive prevents UV degradation',
      'Slow-release erosion formula maintains stable sanitizer residuals',
      'Does not cloud swimming pool water'
    ],
    specs: {
      'Active Ingredient': 'Trichloro-s-triazinetrione (99%)',
      'Tablet Weight': '200g per tablet',
      'Solubility': 'Slow erosion (5-7 days per tablet)',
      'Ideal pH Range': '7.2 - 7.6'
    },
    isBulkEligible: true,
    minBulkQty: 3,
    // Website-authored, so listed and not stock-tracked until the
    // inventory system takes ownership of the item by SKU.
    isListed: true,
    stockTracked: false,
    stockAvailable: null,
  },
  {
    id: 'prod-bio-pure',
    sku: 'HDS-BIO-PURE',
    name: 'Bio-Pure Eco Multi-Surface Sanitizer',
    category: 'kitchen_housekeeping',
    subcategory: 'Sanitation Chemicals',
    description: 'A 100% plant-based cleaner and sanitizer engineered for high-touch restaurant and kids-activity zones in premium resorts. Non-hazardous and absolutely safe for food-contact surfaces.',
    price: 2400,
    unit: '4x5L Case',
    image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=600',
    features: [
      'No rinsing required after treatment, saving 40% clean time',
      'Hypoallergenic formula absolute safe for kids and premium upholstery',
      'Zero synthetic dyes, endocrine-disruptors or hazardous allergens',
      'Excellent degreasing power sourced from sugarcane esters'
    ],
    specs: {
      'Base Compound': 'Sugarcane & Coconut glucosides',
      'Surface Safety': 'Glass, Ceramic, Wood, Stainless Steel, Leather',
      'Rinse Requirement': 'Zero (Air Dry)',
      'Biodegradability': '100% within 14 days'
    },
    isBulkEligible: true,
    minBulkQty: 10,
    // Website-authored, so listed and not stock-tracked until the
    // inventory system takes ownership of the item by SKU.
    isListed: true,
    stockTracked: false,
    stockAvailable: null,
  },
  {
    id: 'equip-silentstream',
    sku: 'HDS-SILENTSTREAM',
    name: 'HDS SilentStream Pro HEPA Dry/Wet Vacuum',
    category: 'equipment',
    subcategory: 'Sanitation Machinery',
    description: 'A hospital-grade high-power vacuum generator designed with micro-insulated steel chambers. Operates below 52dB to enable seamless operations in running hotels and emergency rooms without disturbance.',
    price: 34500,
    unit: 'Unit',
    image: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&q=80&w=600',
    features: [
      'Ultra-silent 52 decibel operation at full motor suction',
      'Certified H14 HEPA filtration catching particles down to 0.1 microns',
      'Huge 35-liter tank constructed from impact-resistant food-safe stainless steel',
      'Substantial 24kPA vacuum suction power with double turbine stage'
    ],
    specs: {
      'Motor Rating': '1400 Watts Peak Power',
      'Noise Emission': '50 - 52 dB(A)',
      'Filtration Stage': '4-stage HEPA System',
      'Hose Length': '3.2 Meters reinforced non-kink'
    },
    isBulkEligible: false,
    minBulkQty: 1,
    // Website-authored, so listed and not stock-tracked until the
    // inventory system takes ownership of the item by SKU.
    isListed: true,
    stockTracked: false,
    stockAvailable: null,
  },
  {
    id: 'equip-optimus-scrub',
    sku: 'HDS-OPTIMUS-SCRUB',
    name: 'Optimus Floor Scrubber & Polisher',
    category: 'equipment',
    subcategory: 'Sanitation Machinery',
    description: 'Battery-electric high speed orbital scrubber. Brings absolute marble and terrazzo floor luster back to premium corporate centers and resorts with custom orbital pads.',
    price: 185000,
    unit: 'Unit',
    image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&q=80&w=600',
    features: [
      'Dual multi-directional counter-rotating orbital pads',
      'Integrated detergent batch dispenser and fast vacuum recovery squeegee',
      'Tough maintenance-free brushless DC motor',
      'Up to 4 hours of autonomous run-time on high-capacity LiFePO4 cells'
    ],
    specs: {
      'Brush Speed': '175 RPM',
      'Battery Sizing': '24V / 60Ah Lithium',
      'Coverage Speed': '1,800 square meters per hour',
      'Dead Weight': '48 kg (Self-propelled options)'
    },
    isBulkEligible: true,
    minBulkQty: 2,
    // Website-authored, so listed and not stock-tracked until the
    // inventory system takes ownership of the item by SKU.
    isListed: true,
    stockTracked: false,
    stockAvailable: null,
  },
  {
    id: 'equip-purewave',
    sku: 'HDS-PUREWAVE',
    name: 'PureWave Dry Thermal Microsteam Generator',
    category: 'equipment',
    subcategory: 'Sanitation Machinery',
    description: 'Generates superheated dry microsteam at 180°C and 8 Bar pressure. Uniquely sanitizes mattresses, luxurious carpet weave, and velvet headboards in elite suites, instantly eradicating bed bugs, mites, and viral strains.',
    price: 78000,
    unit: 'Unit',
    image: 'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&q=80&w=600',
    features: [
      'Incredibly low moisture steam output prevents carpet rot and decreases drying time to just 15 minutes',
      '8 Bar pressurized jet cleans out tile grouting effortlessly',
      'Continuous-fill luxury copper boiler with protective auto-shutoff',
      'Includes 14 specialized hospitality heads'
    ],
    specs: {
      'Steam Pressure': '8.2 Bar Max',
      'Temperature': '180 °C (At nozzle)',
      'Boiler Heating': '2200W rapid-heating element',
      'Reservoir Vol': '3.5 Liters dual-tank system'
    },
    isBulkEligible: false,
    minBulkQty: 1,
    // Website-authored, so listed and not stock-tracked until the
    // inventory system takes ownership of the item by SKU.
    isListed: true,
    stockTracked: false,
    stockAvailable: null,
  },
  {
    id: 'tool-microfiber',
    sku: 'HDS-MICROFIBER',
    name: 'AcroClean Antibacterial Microfiber Mop Set',
    category: 'janitorial_tools',
    subcategory: 'Manual Utilities',
    description: 'Aerospace aluminum telescopic mop system utilizing anti-microbial silver-infused split microfiber yarn. Includes color-coded systems for strict hospital hygiene zone separating.',
    price: 3200,
    unit: 'Set (Pole + 4 Pads)',
    image: 'https://images.unsplash.com/photo-1563453392212-326f5e854473?auto=format&fit=crop&q=80&w=600',
    features: [
      'Silver-ion embedding prevents bacterial breeding in stored mop heads',
      'Ergonomic swivel joint revolves full 360-degrees around complex heavy furniture',
      'TFE-coated lightweight structural aluminum shaft extending to 1.8M',
      'Lifts micro-dust and greasy smears without chemical sanitizers'
    ],
    specs: {
      'Material Composition': '80% Polyester, 20% Polyamide + Silver Nano',
      'Extension Reach': '110 cm to 180 cm sliding lock',
      'Mop Pad Wash Cycles': 'Guaranteed 500 clinical wash cycles',
      'Color Coding options': 'Red (Critical, Restrooms), Blue (Lobbies), Green (Food Areas)'
    },
    isBulkEligible: true,
    minBulkQty: 10,
    // Website-authored, so listed and not stock-tracked until the
    // inventory system takes ownership of the item by SKU.
    isListed: true,
    stockTracked: false,
    stockAvailable: null,
  },
  {
    id: 'tool-pool-skimmer',
    sku: 'HDS-POOL-SKIMMER',
    name: 'Pro-Sweep Carbon telesco-Pole & Leaf Net',
    category: 'pool_care',
    subcategory: 'Pool Accessories',
    description: 'An elite pool keeper kit designed to handle vast resort lagoons. Constructed of rigid woven carbon fiber tubes with a micro-mesh chemical-resistant debris basket.',
    price: 5400,
    unit: 'Set',
    image: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&q=80&w=600',
    features: [
      '100% carbon-fiber weave has half the weight but double the rigidity of standard aluminum',
      'Fine-knit polymer netting collects small pollen and wind-blown dust fields',
      'Push-to-click connection fits standard generic pool cleaning attachments',
      'Anti-slip dual-molded thermoplastic handle'
    ],
    specs: {
      'Pole Material': 'High-modulus carbon fiber composite',
      'Telescopic Limit': '3 Stages, 6 feet to 16 feet',
      'Net Framing': 'Flexible impact-proof Polycarbonate',
      'Mesh Size': '150 Micron ultra-fine weave'
    },
    isBulkEligible: true,
    minBulkQty: 5,
    // Website-authored, so listed and not stock-tracked until the
    // inventory system takes ownership of the item by SKU.
    isListed: true,
    stockTracked: false,
    stockAvailable: null,
  },
  {
    id: 'tool-bucket-wringer',
    sku: 'HDS-BUCKET-WRINGER',
    name: 'Pro-Janitor 36-Liter Structural Foam Bucket',
    category: 'janitorial_tools',
    subcategory: 'Manual Utilities',
    description: 'Heavy janitor bucket molded from solid acoustic structural foam. High-efficiency downward wringer extracts water with half the standard operator drag, saving hand fatigue.',
    price: 6800,
    unit: 'Unit',
    image: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&q=80&w=600',
    features: [
      'Solid structural foam walls do not warp or microcrack under massive weight loading',
      'Frictionless ball-bearing rubber casters do not squeak or mark luxury hardwood floors',
      'Deep chemical divider keeps dirty waste water fully apart from sanitizing dilution',
      'High-level leverage handle design prevents lumbar strain'
    ],
    specs: {
      'Bucket Capacity': '36 Liters (9.5 Gallons)',
      'Washing Stage': 'Dual clean-basin dividing slots',
      'Impact Rating': 'Survives a 5-meter full water drop',
      'Dimensions': '65 x 46 x 98 cm'
    },
    isBulkEligible: true,
    minBulkQty: 4,
    isListed: true,
    stockTracked: false,
    stockAvailable: null,
  }
];

export const SERVICES: Service[] = [
  {
    id: 'serv-deep-sanitation',
    name: 'Comprehensive Institutional Deep Sanitation & Disinfection',
    category: 'general_sanitation',
    tagline: 'Pathogen-free assurance protocols tailored for prestige hotels, office towers, and medical suites.',
    description: 'An exhaustive deep-cleansing program consisting of high-efficiency HEPA dusting, advanced bio-spraying with Luxe-San sanitizer, physical washing of detailing strips, and dry-vapor sterilization of soft drapery. Backed by formal microbiological swab verification.',
    basePrice: 120, // Per square meter
    unit: 'sq.m.',
    image: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&q=80&w=600',
    features: [
      'Microbiological ATP luminescence verification tests pre- and post-cleaning',
      'Hospital-approved EPA disinfectants completely neutral to human contact',
      'Execution by specialized cleaning technicians in discrete, branded HDS suits',
      'Sanitation reports generated and stamped for regulatory compliance audits'
    ],
    institutionalPros: [
      'Minimizes hotel room downtime (ready within 30 minutes of treatment)',
      'Documented compliance lowers commercial liability cover rates',
      'Impeccable lavender botanical scent increases luxury scores'
    ],
    idealFor: [
      'Five-star Resorts & Spa complexes',
      'Orthopedic Clinics & Dental Centers',
      'International Schools & High-density Auditoriums'
    ],
    frequencyOptions: [
      'One-time Terminal Sanitation',
      'Bi-weekly Maintenance Cycle',
      'Monthly Facility Deep Refresh'
    ]
  },
  {
    id: 'serv-pool-stewardship',
    name: 'Crystal-Clear Premium Resort Water Stewardship',
    category: 'pool_maintenance',
    tagline: 'Keep your luxury pools pristine and bacteriologically pure with custom daily/weekly management.',
    description: 'Expert water conditioning led by professional pool caretakers. Covers deep tile brush descaling, underwater sediment vacuuming, filter media chemical rejuvenation, and molecular-level balancing. Keeps pool water clear, blue, and balanced to prevent skin irritation of elite clientele.',
    basePrice: 15000, // Monthly retainer base
    unit: 'Month',
    image: 'https://images.unsplash.com/photo-1576013551528-76678b88fdf5?auto=format&fit=crop&q=80&w=600',
    features: [
      'Photometric digital testing of pH, Total Alkalinity, Free/Combined Chlorine, and Calcium hardness',
      'Thorough brushing of waterlines and scaling extraction to prevent concrete pitting',
      'Heavy commercial vacuum filtration catching fine sand, hair, and silt',
      'Emergency algaecide mitigation cycles within 4 hours if lagoon blossoms occur'
    ],
    institutionalPros: [
      'Extends life of luxury custom pump motors and titanium heat-exchangers by 50%',
      'Safeguards resort ratings against negative water-quality guest remarks',
      'Full logs supplied electronically matching government sanitarians demands'
    ],
    idealFor: [
      'Resort Infinity Pools & Large Multi-tier Water Parks',
      'Luxury Health Spa plunge pools',
      'High-end Condominium Rooftop Pools'
    ],
    frequencyOptions: [
      'Daily Supervision Retainer (High Traffic)',
      'Tri-weekly Scheduled Pool Care (Standard Resorts)',
      'Weekly Comprehensive Service Plan'
    ]
  },
  {
    id: 'serv-specialized-hygiene',
    name: 'Bio-Sterile ICU & Hospital Clinic Sanitation',
    category: 'specialized_hygiene',
    tagline: 'Surgical-standard cleaning engineered for absolute sterile integrity and infection prevention.',
    description: 'Dedicated cleanliness regimes supporting operating theaters, dialysis chairs, emergency rooms, and modern medical centers. Governed under standard WHO and DOH sterile policies using our most potent anti-pathogen solutions.',
    basePrice: 280, // Per sq.m.
    unit: 'sq.m.',
    image: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&q=80&w=600',
    features: [
      'Strict color-coded microcloth discipline eliminates cross-room transfers',
      'Dual-operator double checks with UV marker light verification',
      'All technicians trained under clinical grade cross-contamination standards',
      'Aerosolized misting available for complete structural envelope protection'
    ],
    institutionalPros: [
      'Reduces hospital-acquired infection (HAI) rates drastically',
      'Certified documentation matching DOH sanitation checklist requirements',
      'Staff with zero-trace immunization clearances and complete medical screenings'
    ],
    idealFor: [
      'Hospital Surgical Bays',
      'Vascular Diagnostic Laboratories',
      'Pediatric Wards & Oncology Centers'
    ],
    frequencyOptions: [
      'Continuous 24/7 Ward Attendants',
      'Daily Night Shift Sterilization',
      'Quarterly Ultra-Clear Verification Sweeps'
    ]
  }
];
