'use strict';

/*
 * All nutrition data lives here.
 *
 * FOODS  — one entry per ingredient. kcal and protein are per 100 of `unit`
 *          (or per single piece where unit is 'pc'). `shop` is the aisle group.
 * meal() — builds a meal from a list of [foodKey, qty] pairs and derives
 *          calories, protein and the shopping-list contribution automatically.
 *          Nothing is hand-totalled, so the numbers can never drift.
 *
 * Portions below follow the programme's Revision 2 (27 Aug 2026) portion
 * reference table. Day totals computed here match the document's printed
 * per-day kcal/protein figures to within rounding.
 */

const FOODS = {
  chicken_raw:   { label: 'Chicken breast',        unit: 'g',  kcal: 120, protein: 22.5, shop: 'Protein', cookedYield: 0.75 },
  fish_raw:      { label: 'Fish fillet (basa)',    unit: 'g',  kcal: 90,  protein: 16,   shop: 'Protein', cookedYield: 0.78 },
  egg:           { label: 'Eggs',                  unit: 'pc', kcal: 70,  protein: 6,    shop: 'Protein' },
  egg_white:     { label: 'Eggs (for whites)',     unit: 'pc', kcal: 17,  protein: 3.6,  shop: 'Protein' },
  curd:          { label: 'Curd / Greek yogurt',   unit: 'g',  kcal: 60,  protein: 10,   shop: 'Protein' },
  milk:          { label: 'Milk',                  unit: 'ml', kcal: 62,  protein: 3.2,  shop: 'Protein' },
  dal_raw:       { label: 'Toor dal',              unit: 'g',  kcal: 335, protein: 22,   shop: 'Protein' },
  isolate:       { label: 'Whey isolate',          unit: 'g',  kcal: 370, protein: 83,   shop: 'Supplements' },

  rice_raw:      { label: 'Basmati rice',          unit: 'g',  kcal: 350, protein: 7,    shop: 'Carbs', cookedYield: 3 },
  roti:          { label: 'Roti',                  unit: 'pc', kcal: 120, protein: 3,    shop: 'Carbs' },
  oats:          { label: 'Rolled oats',           unit: 'g',  kcal: 380, protein: 13,   shop: 'Carbs', cookedYield: 4 },

  veg_mix:       { label: 'Roasting vegetables',   unit: 'g',  kcal: 45,  protein: 2,    shop: 'Vegetables' },
  salad_mix:     { label: 'Salad vegetables',      unit: 'g',  kcal: 18,  protein: 1,    shop: 'Vegetables' },
  onion:         { label: 'Onion',                 unit: 'g',  kcal: 40,  protein: 1.1,  shop: 'Vegetables' },
  tomato:        { label: 'Tomato',                unit: 'g',  kcal: 18,  protein: 0.9,  shop: 'Vegetables' },
  spinach:       { label: 'Spinach',                unit: 'g',  kcal: 23,  protein: 2.9,  shop: 'Vegetables' },

  banana:        { label: 'Banana',                unit: 'pc', kcal: 105, protein: 1.3,  shop: 'Fruit' },
  apple:         { label: 'Apple',                 unit: 'pc', kcal: 95,  protein: 0.5,  shop: 'Fruit' },
  berries:       { label: 'Frozen berries',        unit: 'g',  kcal: 45,  protein: 0.7,  shop: 'Fruit' },
  almond:        { label: 'Almonds',               unit: 'pc', kcal: 7,   protein: 0.26, shop: 'Fruit' },

  oil:           { label: 'Cooking oil',           unit: 'tsp', kcal: 40, protein: 0,    shop: 'Pantry' },
  olive_oil:     { label: 'Olive oil',             unit: 'tsp', kcal: 40, protein: 0,    shop: 'Pantry' },
  ghee:          { label: 'Ghee',                  unit: 'tsp', kcal: 45, protein: 0,    shop: 'Pantry' },
  chia:          { label: 'Chia seeds',            unit: 'g',  kcal: 490, protein: 17,   shop: 'Pantry' }
};

const round = (n, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };

function meal(id, time, title, items, note) {
  let kcal = 0, protein = 0;
  const ing = [];
  for (const [key, qty] of items) {
    const f = FOODS[key];
    if (!f) throw new Error('Unknown food: ' + key);
    const factor = f.unit === 'pc' ? qty : qty / 100;
    kcal += f.kcal * factor;
    protein += f.protein * factor;
    ing.push({ key, qty, label: f.label, unit: f.unit, shop: f.shop });
  }
  return { id, time, title, note: note || null, kcal: Math.round(kcal), protein: round(protein, 1), ing };
}

/* ---------------------------------------------------------------- Plan A */

const A = {
  breakfastEggs: () => meal('a-bfast',  '12:00', 'Egg scramble + 2 rotis',
                     [['egg', 3], ['egg_white', 3], ['onion', 40], ['tomato', 50], ['spinach', 40], ['oil', 1], ['roti', 2]],
                     'Moderate heat, stir slowly.'),
  breakfastOats: () => meal('a-bfast-oats', '12:00', 'Overnight oats jar + isolate',
                     [['oats', 65], ['milk', 200], ['curd', 60], ['chia', 10], ['berries', 60], ['isolate', 30]],
                     'Stir the isolate in fresh each morning.'),
  shake:       () => meal('a-shake',  '15:00', 'Protein shake + banana + 15 almonds',
                     [['isolate', 30], ['banana', 1], ['almond', 15]]),
  curdFruit:   () => meal('a-curd',   '15:00', 'Curd + banana + 12 almonds',
                     [['curd', 200], ['banana', 1], ['almond', 12]]),
  main:        () => meal('a-main',   '18:30', 'Chicken + rice + vegetables + salad',
                     [['chicken_raw', 220], ['rice_raw', 55], ['veg_mix', 150], ['salad_mix', 120], ['olive_oil', 1]],
                     '220 g raw is about 165 g cooked.'),
  mainRoti:    () => meal('a-main-r', '18:30', 'Chicken + 2 rotis + vegetables + salad',
                     [['chicken_raw', 220], ['roti', 2], ['veg_mix', 150], ['salad_mix', 120], ['olive_oil', 1]]),
  dinFish:     () => meal('a-din-f',  '20:00', 'Fish + roasted vegetables + rice',
                     [['fish_raw', 180], ['veg_mix', 150], ['rice_raw', 75], ['oil', 1], ['olive_oil', 1]]),
  dinDal:      () => meal('a-din-d',  '20:00', 'Dal + 2 rotis + curd + salad',
                     [['dal_raw', 60], ['ghee', 1], ['onion', 30], ['tomato', 40], ['roti', 2], ['curd', 100], ['salad_mix', 120]]),
  dinBhurji:   () => meal('a-din-cb', '20:00', 'Chicken bhurji + roti + rice + salad',
                     [['chicken_raw', 165], ['onion', 40], ['tomato', 50], ['oil', 2], ['roti', 2], ['rice_raw', 20], ['salad_mix', 120]]),
  dinChicken:  () => meal('a-din-c',  '20:00', 'Chicken + large salad',
                     [['chicken_raw', 200], ['salad_mix', 200], ['olive_oil', 1]]),
  flex:        () => ({ ...meal('a-flex', '18:30', 'Flexible meal — eat what you want', []),
                     kcal: 800, protein: 45, estimate: true,
                     note: 'Counted as an 800 kcal estimate. Log the real thing under Extras if you want it exact.' })
};

/* ---------------------------------------------------------------- Plan B */

const B = {
  oats:        () => meal('b-oats',   '09:00', 'Overnight oats jar + isolate',
                     [['oats', 35], ['milk', 130], ['curd', 40], ['chia', 8], ['berries', 50], ['isolate', 30]],
                     'Stir the isolate in fresh each morning.'),
  breakfastEggs: () => meal('b-eggs', '09:00', 'Egg scramble + roti + curd',
                     [['egg', 2], ['egg_white', 2], ['onion', 30], ['tomato', 40], ['spinach', 30], ['oil', 1], ['roti', 1], ['curd', 150]],
                     'Moderate heat, stir slowly.'),
  shake:       () => meal('b-shake',  '16:30', 'Protein shake + apple + 6 almonds',
                     [['isolate', 30], ['apple', 1], ['almond', 6]]),
  curdFruit:   () => meal('b-curd',   '16:30', 'Curd + apple + 14 almonds',
                     [['curd', 150], ['apple', 1], ['almond', 14]]),
  lunchRice:   () => meal('b-lunch',  '13:00', 'Chicken + rice + vegetables + salad',
                     [['chicken_raw', 170], ['rice_raw', 33], ['veg_mix', 150], ['salad_mix', 120], ['olive_oil', 1]],
                     'Walk 10–15 minutes afterwards.'),
  lunchRoti:   () => meal('b-lunch-r','13:00', 'Chicken + roti + vegetables + salad',
                     [['chicken_raw', 170], ['roti', 1], ['veg_mix', 150], ['salad_mix', 120], ['olive_oil', 1]],
                     'Walk 10–15 minutes afterwards.'),
  dinFish:     () => meal('b-din-f',  '19:00', 'Fish + roasted vegetables + rice',
                     [['fish_raw', 170], ['veg_mix', 150], ['rice_raw', 45], ['almond', 8], ['oil', 1], ['olive_oil', 1]],
                     'Walk 10–15 minutes afterwards.'),
  dinDal:      () => meal('b-din-d',  '19:00', 'Dal + roti + salad',
                     [['dal_raw', 50], ['ghee', 1], ['onion', 30], ['tomato', 40], ['roti', 1], ['salad_mix', 120]],
                     'Walk 10–15 minutes afterwards.'),
  dinBhurji:   () => meal('b-din-cb', '19:00', 'Chicken bhurji + roti + rice + salad',
                     [['chicken_raw', 130], ['onion', 40], ['tomato', 50], ['oil', 2], ['roti', 1], ['rice_raw', 20], ['salad_mix', 120]],
                     'Walk 10–15 minutes afterwards.'),
  dinChickenSalad: () => meal('b-din-s', '19:00', 'Chicken + large salad',
                     [['chicken_raw', 150], ['salad_mix', 200], ['olive_oil', 1]]),
  flex:        () => ({ ...meal('b-flex', '13:00', 'Flexible meal — eat what you want', []),
                     kcal: 650, protein: 35, estimate: true,
                     note: 'Counted as a 650 kcal estimate. Log the real thing under Extras if you want it exact.' })
};

/* --------------------------------------------------------- Weekly plans */

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const PLANS = {
  A: {
    key: 'A',
    label: 'Plan A',
    targetKcal: 1950,
    targetProtein: 165,
    window: '12:00 – 20:00',
    windowNote: '16:8 — black coffee, tea and water outside it.',
    week: {
      mon: [A.breakfastOats(), A.shake(), A.main(), A.dinFish()],
      tue: [A.breakfastEggs(), A.curdFruit(), A.mainRoti(), A.dinDal()],
      wed: [A.breakfastOats(), A.shake(), A.main(), A.dinBhurji()],
      thu: [A.breakfastEggs(), A.curdFruit(), A.main(), A.dinFish()],
      fri: [A.breakfastOats(), A.shake(), A.mainRoti(), A.dinDal()],
      sat: [A.breakfastEggs(), A.curdFruit(), A.main(), A.dinBhurji()],
      sun: [A.breakfastEggs(), A.shake(), A.flex(), A.dinChicken()]
    }
  },
  B: {
    key: 'B',
    label: 'Plan B',
    targetKcal: 1500,
    targetProtein: 120,
    window: '09:00 – 19:00',
    windowNote: '14:10 — a gentler window, chosen deliberately for PCOS.',
    week: {
      mon: [B.oats(), B.lunchRice(), B.shake(), B.dinFish()],
      tue: [B.breakfastEggs(), B.lunchRoti(), B.curdFruit(), B.dinDal()],
      wed: [B.oats(), B.lunchRice(), B.shake(), B.dinBhurji()],
      thu: [B.breakfastEggs(), B.lunchRice(), B.curdFruit(), B.dinFish()],
      fri: [B.oats(), B.lunchRoti(), B.shake(), B.dinDal()],
      sat: [B.breakfastEggs(), B.lunchRice(), B.curdFruit(), B.dinBhurji()],
      sun: [B.breakfastEggs(), B.flex(), B.shake(), B.dinChickenSalad()]
    }
  }
};

/* A shared login for a device that lives in the kitchen — shows both
   plans' meals together in time order, for meal prep and shopping.
   Ticking a meal here logs against this account alone, never against
   either person's own log. */
PLANS.KITCHEN = {
  key: 'KITCHEN',
  label: 'Both plans',
  targetKcal: PLANS.A.targetKcal + PLANS.B.targetKcal,
  targetProtein: PLANS.A.targetProtein + PLANS.B.targetProtein,
  window: 'All day',
  windowNote: 'Both plans together — each meal tagged with whose it is.',
  week: Object.fromEntries(DAYS.map(d => [
    d,
    [
      ...PLANS.A.week[d].map(m => ({ ...m, plan: 'A' })),
      ...PLANS.B.week[d].map(m => ({ ...m, plan: 'B' }))
    ].sort((x, y) => x.time.localeCompare(y.time))
  ]))
};

/* ------------------------------------------------------------- Recipes */

const RECIPES = [
  {
    id: 'chicken', name: 'Batch masala grilled chicken', yield: '≈1.9 kg cooked',
    tag: 'Sunday batch', time: '25 min + marinade',
    ingredients: [
      'Chicken breast, cubed 3–4 cm — 2.5 kg', 'Thick curd — 375 g', 'Ginger-garlic paste — 4 tbsp',
      'Red chilli powder — 2½ tsp', 'Coriander powder — 2½ tsp', 'Turmeric — 1¼ tsp',
      'Garam masala — 1½ tsp', 'Lemon juice — from 2 lemons', 'Salt — 2½ tsp', 'Oil — 2 tbsp'
    ],
    steps: [
      'Whisk everything except the chicken into a smooth marinade.',
      'Fold in the chicken. Marinate 30 minutes minimum; overnight is meaningfully better — the curd acidity is what stops the breast going dry.',
      'Spread across two lined trays in a single layer, with gaps. Crowded chicken steams instead of browning.',
      'Roast at 220 °C for 20–22 minutes without flipping. Internal temperature 74 °C.',
      'Rest five minutes before portioning.'
    ],
    per100: '175 kcal · 31 g protein'
  },
  {
    id: 'rice', name: 'Base rice', yield: '≈1.35 kg cooked', tag: 'Sunday batch', time: '20 min',
    ingredients: ['Basmati rice — 450 g, rinsed until clear', 'Water — 800 ml', 'Salt — 1 tsp'],
    steps: [
      'Pressure cook two whistles, then let the pressure fall naturally.',
      'Fluff with a fork and spread on a tray to cool fast.',
      'Refrigerate within the hour. Cooked rice held warm grows Bacillus cereus, which produces a toxin that reheating does not destroy.'
    ],
    per100: '130 kcal · 2.7 g protein',
    warn: 'Cool within one hour. Use within three days. Reheat once, never twice.'
  },
  {
    id: 'veg', name: 'Roasted vegetable tray', yield: '≈1.3 kg, 8 servings', tag: 'Sunday batch', time: '25 min',
    ingredients: [
      'Broccoli or cauliflower florets — 600 g', 'Bell peppers, thick strips — 450 g',
      'Zucchini or green beans — 450 g', 'Carrots, batons — 350 g', 'Olive oil — 3 tbsp',
      'Salt — 1½ tsp', 'Black pepper — 1 tsp', 'Cumin seeds — 1½ tsp'
    ],
    steps: [
      'Toss everything together and spread across two trays in one layer.',
      'Roast at 220 °C for 25 minutes. You want charred edges — that is the flavour.',
      'Undersalting is why people find roasted vegetables boring.'
    ],
    per100: '60 kcal · 2 g protein'
  },
  {
    id: 'dal', name: 'Dal tadka', yield: '≈900 g, 6 servings', tag: 'Sunday batch', time: '30 min',
    ingredients: [
      'Toor dal — 300 g, rinsed', 'Water — 900 ml', 'Turmeric — 1 tsp', 'Salt — 1½ tsp',
      'Ghee — 1 tbsp', 'Cumin seeds — 1 tsp', 'Mustard seeds — ½ tsp', 'Onion — 1 medium',
      'Ginger-garlic paste — 1 tbsp', 'Tomatoes — 2', 'Red chilli powder — 1 tsp', 'Curry leaves — 8'
    ],
    steps: [
      'Pressure cook the dal, water, turmeric and salt for four whistles. Mash lightly.',
      'Heat the ghee, splutter the seeds, add curry leaves and onion, cook to golden.',
      'Add ginger-garlic, then tomato and chilli. Cook until the oil visibly separates — that separation is the signal it is done.',
      'Stir the tadka into the dal.'
    ],
    per100: '110 kcal · 6.7 g protein'
  },
  {
    id: 'oats', name: 'Overnight oats jars', yield: '5 jars', tag: 'Sunday batch', time: '15 min',
    ingredients: [
      'Per jar — rolled oats 40 g', 'Milk 150 ml', 'Curd or Greek yogurt 50 g',
      'Chia seeds 1 tsp', 'Frozen berries 50 g', 'Cinnamon, a pinch', 'Whey isolate 1 scoop'
    ],
    steps: [
      'Layer oats, milk, curd, chia and berries in a jar. Refrigerate overnight.',
      'Stir in the isolate in the morning, not the night before — protein powder left in liquid for eight hours turns gluey.',
      'The chia and cinnamon are not decoration. Both flatten the glucose curve.'
    ],
    per100: '400 kcal per jar · 33 g protein'
  },
  {
    id: 'chicken-bhurji', name: 'Chicken bhurji', yield: '≈550 g cooked, 3 servings', tag: 'Sunday batch', time: '20 min',
    ingredients: [
      'Chicken breast — 700 g, minced or very finely chopped', 'Onion — 2 medium, fine',
      'Tomato — 2 large, chopped', 'Ginger-garlic paste — 1 tbsp', 'Green chilli — 1, slit',
      'Turmeric — ¾ tsp', 'Red chilli powder — 1½ tsp', 'Garam masala — ¾ tsp',
      'Oil — 2 tbsp', 'Salt — 1 tsp', 'Coriander leaves, to finish'
    ],
    steps: [
      'Sauté the onion to golden, add the ginger-garlic and cook off the raw smell.',
      'Add tomato, chilli and the dry spices and cook until the oil separates.',
      'Add the minced chicken, breaking it up as it goes, and cook 10–12 minutes on medium — longer than paneer needed, because this has to cook through rather than simply warm.',
      'The mince releases water as it cooks. Raise the heat at the end and let it dry off, or the texture goes sloppy.'
    ],
    per100: '150 kcal · 26 g protein'
  },
  {
    id: 'fish', name: 'Pan-seared masala fish', yield: '1 portion', tag: 'Cook fresh', time: '6 min',
    ingredients: [
      'Fish fillet — 180 g (Plan A) or 170 g (Plan B)', 'Turmeric — ½ tsp',
      'Red chilli powder — ½ tsp', 'Salt', 'Lemon juice — 1 tsp', 'Oil — 1 tsp'
    ],
    steps: [
      'Rub the spices and lemon into the fillet and rest ten minutes.',
      'Pan-fry in hot oil, three minutes a side, or bake at 200 °C for twelve minutes.',
      'Done when it flakes under light pressure from a fork.'
    ],
    per100: '105 kcal · 21 g protein (basa)',
    warn: 'Do not batch cook. The texture collapses on reheating.'
  },
  {
    id: 'salad', name: 'Salad kit', yield: '6 servings', tag: 'Sunday batch', time: '10 min',
    ingredients: [
      'Cucumber 600 g', 'Lettuce 300 g', 'Tomato 400 g', 'Onion 150 g', 'Carrot 150 g',
      'Dressing per serving: 1 tsp olive oil, lemon, salt, pepper'
    ],
    steps: [
      'Chop and box together with a folded paper towel on top to absorb condensation — it buys roughly three extra days.',
      'Store dry. Dress at the plate, never in the box.'
    ],
    per100: '18 kcal · 1 g protein'
  },
  {
    id: 'eggs', name: 'Morning egg scramble', yield: '1 portion', tag: 'Cook fresh', time: '5 min',
    ingredients: [
      'Whole eggs — 3', 'Egg whites — 3', 'Onion, tomato, spinach — a generous handful',
      'Oil — 1 tsp', 'Turmeric, chilli powder, salt'
    ],
    steps: [
      'Soften the vegetables first, add the spices, then pour in the beaten eggs.',
      'Keep the heat moderate and stir slowly. High heat is what makes scrambled egg weep water.'
    ],
    per100: 'With 2 rotis: 536 kcal · 37 g protein'
  },
  {
    id: 'shake', name: 'Afternoon protein shake', yield: '1 portion', tag: 'Cook fresh', time: '2 min',
    ingredients: ['Whey isolate — 1 scoop (30 g)', 'Water — 250 ml', 'Banana — 1 medium', 'Almonds — 15, alongside'],
    steps: ['Blend or shake. The almonds are eaten, not blended — chewing is more satiating.'],
    per100: '321 kcal · 30 g protein'
  }
];

/* ------------------------------------------------------------ Prep plan */

const PREP = {
  sunday: [
    ['0:00', 'Rice into the pressure cooker. Dal rinsed and set to boil.'],
    ['0:10', 'Chop everything: roasting vegetables, salad kit, onions and tomatoes for masala.'],
    ['0:25', 'Cube and marinate the chicken. Preheat oven to 220 °C.'],
    ['0:35', 'Vegetable trays into the oven.'],
    ['0:50', 'Vegetables out, chicken in. Put 12 eggs on to boil.'],
    ['1:15', 'Chicken out and resting. Finish the dal tadka. Eggs into cold water.'],
    ['1:30', 'Assemble five overnight oats jars.'],
    ['1:45', 'Make the chicken bhurji.'],
    ['2:00', 'Cool everything uncovered, then portion and label.'],
    ['2:30', 'Finished.']
  ],
  wednesday: [
    'Fresh rice, 200 g raw',
    'Second small vegetable tray, 600 g',
    'Refresh the salad kit',
    'Move Thursday and Friday chicken from freezer to fridge'
  ],
  storage: [
    ['Cooked chicken', '3–4 days', '2 months frozen'],
    ['Cooked rice', '3 days', 'Cool within 1 hour'],
    ['Roasted vegetables', '4 days', 'Do not freeze'],
    ['Dal', '4 days', '2 months frozen'],
    ['Oats jars', '5 days', 'Add protein each morning'],
    ['Chicken bhurji', '3 days', '2 months frozen'],
    ['Salad kit, undressed', '4 days', 'Paper towel in the box'],
    ['Boiled eggs, shell on', '5 days', '—']
  ]
};

const SHOP_ORDER = ['Protein', 'Carbs', 'Vegetables', 'Fruit', 'Pantry', 'Supplements'];

module.exports = { FOODS, PLANS, RECIPES, PREP, DAYS, SHOP_ORDER, round };
