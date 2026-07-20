/**
 * Search aliases — the colloquial phrasings a teammate actually types, mapped
 * to the section that answers them.
 *
 * WHY A CURATED MAP AND NOT FUZZY KEYWORDS
 * The first attempt expanded synonyms across the SECTION TEXT: any section
 * containing "late" got tagged with tardiness keywords. The Dedication says
 * "teammates who showed up early, stayed late" — so "what if I'm late" returned
 * the Dedication, and "who do I tell if I'm being harassed" did too. Smearing
 * synonyms over a corpus makes every narrative chapter match everything.
 *
 * Aliases belong on the QUERY, pointing at ONE section. With ~45 sections a
 * hand-written table is more predictable than anything clever — and when the
 * answer is a policy, predictable is the requirement. An alias hit outranks
 * every text match, so "hurt" lands on Employee Injuries even though that
 * section never uses the word "hurt".
 *
 * KEYED BY EXACT SECTION TITLE as written in guidebook.ts / chapters.ts. A
 * typo here silently does nothing, so the build logs unmatched keys — check
 * the console if an alias seems dead.
 *
 * THIS IS THE MAINTENANCE SURFACE. When someone asks a question the search
 * fumbles, add their exact words here. That's the whole upkeep story.
 */
export const SEARCH_ALIASES: Record<string, string[]> = {
  // ── Showing up ──
  'Calling Off': [
    'call off', 'calling off', 'call in', 'sick', 'cant work', "can't work",
    'cant make it', "can't make it", 'not coming in', 'no call', 'no show',
    'emergency', 'throwing up', 'food poisoning',
  ],
  'Tardiness': ['late', 'running late', 'tardy', 'gonna be late', 'traffic'],
  'Shift Swaps': [
    'swap', 'shift swap', 'cover my shift', 'trade shift', 'find coverage',
    'someone to cover', 'give away shift',
  ],
  'Time Off Requests': [
    'time off', 'day off', 'request off', 'days off', 'request time',
    'vacation request', 'pto request', 'week off',
  ],
  'Availability': ['availability', 'change my availability', 'when i can work'],
  'Work Schedules': [
    'schedule', 'when do i work', 'posted', 'next week schedule', '7shifts',
  ],
  'Holidays': [
    'holiday', 'holidays', 'thanksgiving', 'christmas', 'new years', 'nye',
    'new year', '4th of july', 'fourth of july', 'closed',
  ],

  // ── Time off & leave ──
  'Vacation': ['vacation', 'salaried pto', 'front loaded'],
  'Illinois Paid Leave (PLAWA)': [
    'plawa', 'paid leave', 'pto', 'sick time', 'sick pay', 'illinois leave',
    'paid time off',
  ],
  'How Accrual Works (Hourly, Non-Exempt)': [
    'accrual', 'accrue', 'how much pto', 'pto balance', 'how many hours',
    'earn pto',
  ],

  // ── At work ──
  'Uniform Standards': [
    'wear', 'what to wear', 'dress code', 'uniform', 'shorts', 'jeans',
    'leggings', 'yoga pants', 'shoes', 'hat', 'sweatpants', 'attire',
    'clothes', 'shirt',
  ],
  'Professional Appearance': ['appearance', 'hygiene', 'look professional'],
  'Phones & Personal Devices': [
    'phone', 'cell phone', 'my phone', 'texting', 'on my phone', 'device',
  ],
  'Music': ['music', 'headphones', 'earbuds', 'airpods', 'speaker', 'listen'],
  'Smoking & Vaping': [
    'smoke', 'smoking', 'vape', 'vaping', 'cigarette', 'nicotine', 'break outside',
  ],

  // ── Pay ──
  'Paydays': [
    'payday', 'pay day', 'get paid', 'paycheck', 'pay period', 'when paid',
    'direct deposit', 'gusto', 'pay wrong', 'paid wrong',
  ],
  'Timekeeping': [
    'clock in', 'clock out', 'punch in', 'punch out', 'timeclock', 'time clock',
    'forgot to clock', 'off the clock',
  ],
  'Overtime': ['overtime', 'ot', 'over 40', 'time and a half'],
  'Tips & Gratuities': [
    'tip', 'tips', 'tip pool', 'tip out', 'gratuity', 'cash tips', 'credit card tips',
  ],
  'Private Event Gratuities': ['event gratuity', 'event tips', 'party tips'],
  'Benefits': [
    'benefits', 'insurance', 'health insurance', 'medical', 'dental', 'vision',
    '401k', '401', 'retirement', 'guideline', 'enroll',
  ],

  // ── Safety ──
  'Our Commitment to Safety': ['safety', 'safe'],
  'Workplace Safety': ['unsafe', 'safety procedures', 'broken equipment', 'hazard'],
  'Employee Injuries': [
    'hurt', 'i got hurt', 'injured', 'injury', 'accident', 'cut myself',
    'burned', 'burnt', 'slipped',
  ],
  "Workers' Compensation": [
    'workers comp', 'workmans comp', "worker's comp", 'compensation', 'work injury claim',
  ],
  'Guest Injuries': [
    'guest hurt', 'guest injured', 'guest fell', 'someone fell', 'slip and fall',
    'incident report',
  ],
  'Inclement Weather': [
    'weather', 'snow', 'storm', 'closed for weather', 'snowed in', 'ice',
  ],
  'Emergency Procedures': ['emergency procedure', 'evacuate', 'fire', 'tornado', 'alarm'],

  // ── Expectations ──
  'Harassment-Free Workplace': [
    'harassment', 'harassed', 'harassing', 'discrimination', 'discriminated',
    'bullying', 'bullied', 'retaliation', 'inappropriate', 'uncomfortable',
    'report someone',
  ],
  'Workplace Violence': ['violence', 'threat', 'threatened', 'fight', 'fighting'],
  'Parking': ['park', 'parking', 'where do i park', 'my car'],
  'Visitors': ['visitors', 'friends visit', 'family visit', 'friends come in'],
  'Corrective Action': [
    'write up', 'written up', 'discipline', 'disciplinary', 'fired', 'termination',
    'corrective action', 'in trouble', 'suspended',
  ],
  'Drug & Alcohol-Free Workplace': [
    'drug', 'drugs', 'alcohol', 'drinking', 'weed', 'cannabis', 'marijuana',
    'edible', 'prescription', 'medication',
  ],

  // ── Perks ──
  'Free Bowling': [
    'free bowling', 'bowl free', 'employee bowling', 'can i bowl', 'bring my family',
  ],
  'Food & Beverage Discount': [
    'discount', 'employee discount', 'free drinks', 'food discount', 'half off food',
    'meal', 'eat',
  ],
  'Learning & Growth': [
    'grow', 'growth', 'promotion', 'promoted', 'learn a new position', 'move up',
    'cross train',
  ],
  'Team Events': ['team event', 'team outing', 'staff party', 'holiday party'],

  // ── Working here ──
  'Our Commitment to You': ['commitment to me', 'what do i get'],
  'Equal Opportunity Employment': ['equal opportunity', 'eeo', 'discriminate'],
  'Respect in the Workplace': ['respect', 'disrespect', 'rude'],
  'Open Door Policy': [
    'open door', 'complaint', 'complain', 'concern', 'who do i talk to', 'talk to someone',
  ],
  'Employment Relationship (At-Will)': [
    'at will', 'at-will', 'quit', 'quitting', 'resign', 'two weeks', 'notice',
  ],
  'Your First 90 Days': [
    '90 days', 'ninety days', 'probation', 'introductory', 'first review',
    'new hire', 'raise',
  ],
  'Keeping Your Information Up to Date': [
    'address', 'new address', 'phone number', 'update info', 'emergency contact',
    'tax', 'w4', 'withholding', 'moved',
  ],
};
