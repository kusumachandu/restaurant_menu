// What each plan unlocks. Only the platform owner (super admin) can change a restaurant's plan.
// maxDishes: null means unlimited. maxTables is the number of ordering tables included; the super admin
// can add more per restaurant (Restaurant.extraTables) when a client pays for them.
export const PLANS = {
  starter: { label: 'Starter', maxDishes: 20, view3d: true, ar: true, lookEditor: false, pdfExport: false, ordering: false, maxTables: 0 },
  standard: { label: 'Standard', maxDishes: 100, view3d: true, ar: true, lookEditor: true, pdfExport: true, ordering: false, maxTables: 0 },
  pro: { label: 'Pro', maxDishes: null, view3d: true, ar: true, lookEditor: true, pdfExport: true, ordering: true, maxTables: 10 },
};

export const PLAN_NAMES = Object.keys(PLANS);

export const featuresOf = (plan) => ({ plan, ...(PLANS[plan] || PLANS.starter) });
