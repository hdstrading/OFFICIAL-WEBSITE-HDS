import { discounts, products, reviews, services } from './db.js';
import { PRODUCTS, SERVICES } from './data/catalog.js';
import { newId } from './lib/pricing.js';

/**
 * Fills an empty database with the starting catalogue. Existing rows are never
 * touched, so this is safe to run on every boot — staff edits made in the admin
 * panel survive restarts and redeploys.
 */

const STARTER_DISCOUNTS = [
  { code: 'WELCOME10', type: 'percentage' as const, value: 10, description: '10% welcome discount for new accounts' },
  { code: 'HDS500', type: 'fixed' as const, value: 500, description: '₱500 off corporate orders' },
];

const STARTER_REVIEWS = [
  {
    subjectType: 'service' as const,
    subjectId: SERVICES[0]?.id,
    authorName: 'Marisol Bautista',
    institutionName: 'Grand Horizon Resort',
    role: 'Housekeeping Manager',
    rating: 5,
    comment:
      'The crew arrived exactly within our booked window and worked around a fully occupied floor without a single guest complaint. Water clarity in our lagoon pool was back to spec the same afternoon.',
  },
  {
    subjectType: 'product' as const,
    subjectId: PRODUCTS[0]?.id,
    authorName: 'Reggie Tan',
    institutionName: 'Bluewater Medical Centre',
    role: 'Facilities Supervisor',
    rating: 5,
    comment:
      'We switched our whole disinfection programme over to this concentrate. The dilution ratio genuinely cut our monthly chemical spend, and it passed our infection-control audit without comment.',
  },
  {
    subjectType: 'product' as const,
    subjectId: PRODUCTS[3]?.id,
    authorName: 'Anna Lim',
    institutionName: 'Casa Verde Hotel',
    role: 'Operations Lead',
    rating: 4,
    comment:
      'Genuinely quiet enough to run in corridors during the day, which changed how we schedule cleaning. Delivery took a day longer than quoted, but the team kept us informed.',
  },
];

export function seedIfEmpty(): void {
  if (products.count() === 0) {
    PRODUCTS.forEach((product, index) => products.upsert(product, index));
    console.info(`Seeded ${PRODUCTS.length} products.`);
  }

  if (services.count() === 0) {
    SERVICES.forEach((service, index) => services.upsert(service, index));
    console.info(`Seeded ${SERVICES.length} services.`);
  }

  if (discounts.count() === 0) {
    for (const discount of STARTER_DISCOUNTS) {
      discounts.create({ id: newId(), ...discount });
    }
    console.info(`Seeded ${STARTER_DISCOUNTS.length} discount codes.`);
  }

  if (reviews.count() === 0) {
    const seeded = STARTER_REVIEWS.filter((r) => r.subjectId);
    for (const review of seeded) {
      const subject =
        review.subjectType === 'product'
          ? products.byId(review.subjectId!)
          : services.byId(review.subjectId!);
      if (!subject) continue;
      reviews.insert({
        id: newId(),
        subjectType: review.subjectType,
        subjectId: review.subjectId!,
        subjectName: subject.name,
        authorName: review.authorName,
        institutionName: review.institutionName,
        role: review.role,
        rating: review.rating,
        comment: review.comment,
        verified: true,
        published: true,
        createdAt: new Date().toISOString(),
      });
    }
    console.info(`Seeded ${seeded.length} published reviews.`);
  }
}

// `npm run seed` runs this file directly.
if (process.argv[1]?.includes('seed')) {
  seedIfEmpty();
  console.info('Seeding complete.');
}
