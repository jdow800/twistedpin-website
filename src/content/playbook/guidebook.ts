/**
 * Part Two — The Guidebook.
 *
 * Source of record: `Context/Part Two Guidebook.docx` (Jon, 2026-07-20).
 * Transcribed faithfully. Unlike Part One this is NOT locked — it's policy
 * content that will change as the business does — but treat edits the same
 * way: it's Jon's writing and the meaning is load-bearing.
 *
 * FORMATTING CHANGES MADE DURING TRANSCRIPTION (no meaning altered):
 *  1. The .docx flattened several headings into the end of the preceding
 *     sentence ("...just as every guest does.Equal Opportunity Employment").
 *     Split back apart.
 *  2. The PLAWA section arrived as run-together bullets with inline "•"
 *     characters and hard line-wrap damage. Restructured into real lists.
 *  3. The PLAWA link was line-wrapped in the source as
 *     "labor.illinois.gov/laws rules/paidleave.html" — corrected to the real
 *     URL, `laws-rules`, which is what actually resolves.
 *  4. The tip-pool table lost its structure in extraction; restored as a table.
 *  5. `Context/Guide Book Image Accrued Leave.png` (an Illinois DoL slide) is
 *     rendered as native markup instead of an embedded image — sharper on a
 *     phone, matches the design, and readable by a screen reader. Content is
 *     verbatim from the slide; attribution kept.
 *
 * ⚠️ ONE WORD CHANGED, FLAGGED FOR JON: the source says "Private Event
 * Gratuities" / "Gratuities from private events." CLAUDE.md bans "private" on
 * every surface, and this one matters more than most — the Guidebook is where
 * teammates LEARN the house vocabulary, so a staff-facing "private event"
 * becomes a guest-facing "private event" within a week. Changed to "catered
 * events," matching what TPRS already calls them. Revert if you'd rather keep
 * your wording.
 */

export type GBlock =
  | string
  | { h: string }
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { callout: string[] }
  | { note: string };

export interface GSection {
  title?: string;
  blocks: GBlock[];
}

export interface GChapter {
  id: string;
  /** Shown in the table of contents and the chapter header. */
  title: string;
  /** One-line description under the TOC entry — helps someone scanning for
   *  an answer decide whether to open it. */
  blurb: string;
  sections: GSection[];
}

export const GUIDEBOOK: GChapter[] = [
  {
    id: 'welcome',
    title: 'Welcome to the Guidebook',
    blurb: 'What this section is, and how to use it.',
    sections: [
      {
        blocks: [
          "You've already learned who we are.",
          'This section is about how we work.',
          'Think of it as your reference guide.',
          "Inside, you'll find answers to the questions that come up during everyday work at Twisted Pin—from scheduling and uniforms to safety and time off.",
          "You'll probably come back to it often.",
          "That's okay.",
          'No one is expected to memorize everything.',
          "And if you can't find the answer here...",
          'Ask.',
          "We'd much rather answer a question than have you wonder.",
        ],
      },
    ],
  },

  {
    id: 'working-here',
    title: 'Working at Twisted Pin',
    blurb: 'What you can expect from us, and the ground rules we all share.',
    sections: [
      {
        title: 'Our Commitment to You',
        blocks: [
          'We ask a lot of our teammates.',
          "In return, we believe you deserve a workplace where you're treated with respect, supported as you learn, and given opportunities to grow.",
          'We are committed to providing a workplace that is:',
          {
            list: [
              'Safe',
              'Inclusive',
              'Respectful',
              'Professional',
              'Free from harassment and discrimination',
            ],
          },
          'Every teammate deserves to feel welcome here.',
          'Just as every guest does.',
        ],
      },
      {
        title: 'Equal Opportunity Employment',
        blocks: [
          'Twisted Pin is proud to be an Equal Opportunity Employer.',
          'Employment decisions are based on qualifications, performance, business needs, and the ability to perform the essential functions of the job.',
          'We do not discriminate on the basis of race, color, religion, sex, national origin, age, disability, genetic information, veteran status, or any other characteristic protected by federal, state, or local law.',
          'Simply put...',
          'Everyone deserves the opportunity to succeed here.',
        ],
      },
      {
        title: 'Respect in the Workplace',
        blocks: [
          'Every teammate deserves to feel safe and respected.',
          'That means we treat one another with kindness, professionalism, and respect—even when we disagree.',
          'Harassment, discrimination, bullying, retaliation, or threatening behavior have no place at Twisted Pin.',
          "If something doesn't feel right...",
          'Speak up.',
          "We'll take your concerns seriously.",
        ],
      },
      {
        title: 'Open Door Policy',
        blocks: [
          'Questions are welcome.',
          'Ideas are welcome.',
          'Concerns are welcome.',
          'If something is affecting your ability to do your job or enjoy coming to work, we want to know.',
          'You are encouraged to speak with your supervisor, General Manager, or Owners at any time.',
          "We can't promise every answer will be the one you're hoping for.",
          "But we can promise we'll listen.",
        ],
      },
      {
        title: 'Employment Relationship (At-Will)',
        blocks: [
          'Employment with Twisted Pin is at will, meaning either you or Twisted Pin may end the employment relationship at any time, with or without notice, and with or without cause, as permitted by applicable law.',
          'Nothing in this Guidebook creates a contract of employment or guarantees employment for any specific period of time.',
        ],
      },
      {
        title: 'Your First 90 Days',
        blocks: [
          "Starting a new job is exciting—and there's a lot to learn.",
          'Your first 90 days are designed to help you become comfortable in your role, learn our culture, and build confidence as a member of the Twisted Pin team.',
          "During this time, you'll receive training, coaching, and regular feedback as you learn the responsibilities of your position.",
          "We'll be looking at things like:",
          {
            list: [
              'Learning your role',
              'Quality of your work',
              'Teamwork and communication',
              'Reliability and attendance',
              'Willingness to learn',
              'Attitude and professionalism',
            ],
          },
          'Near the end of your first 90 days, your manager may meet with you to talk about your progress, answer questions, and help you continue growing at Twisted Pin.',
          'This meeting is intended to support your development and is not a wage or performance review for purposes of determining a pay increase.',
          'Completion of the introductory period does not change the at-will nature of your employment.',
        ],
      },
      {
        title: 'Keeping Your Information Up to Date',
        blocks: [
          "Keeping your personal information current helps us communicate with you, ensure you're paid correctly, and contact you in the event of an emergency.",
          'Most of your personal information can be updated directly in Gusto or 7shifts.',
          'Please make sure your information stays current, including:',
          {
            list: [
              'Phone number',
              'Home address (Gusto)',
              'Email address',
              'Emergency contact information',
              'Direct deposit information (Gusto)',
              'Tax withholding information (Gusto)',
            ],
          },
          'If you need help updating your information, just ask a manager. Accurate information helps us support you—and helps avoid delays with payroll, tax documents, benefits, and other important communications.',
        ],
      },
    ],
  },

  {
    id: 'showing-up',
    title: 'Showing Up for Success',
    blurb: 'Availability, schedules, time off, swaps, calling off, and holidays.',
    sections: [
      {
        title: 'Availability',
        blocks: [
          'Your availability is one of the most important pieces of information we have when building the schedule.',
          'All teammates are expected to keep their availability up to date in 7shifts.',
          'If your availability changes, please update it in 7shifts as soon as possible. Permanent changes to your availability should be discussed with your manager, as we hired you based on the availability provided during the hiring process.',
          "While we'll always do our best to accommodate availability requests, we can't guarantee every request can be honored based on business needs.",
        ],
      },
      {
        title: 'Work Schedules',
        blocks: [
          'Our schedules are created using 7shifts and are typically posted 10–14 days in advance.',
          "Once a schedule is published, it's your responsibility to review your upcoming shifts and make sure you're available to work them. We encourage all teammates to enable notifications in 7shifts so you're alerted when a new schedule is posted or when changes are made.",
        ],
      },
      {
        title: 'Time Off Requests',
        blocks: [
          "All time off requests should be submitted through 7shifts. If you're requesting paid time off, you'll also need to submit your request through Gusto.",
          'Please submit requests at least 14 days in advance whenever possible.',
          'Requests are reviewed on a first-come, first-served basis and are not guaranteed.',
        ],
      },
      {
        title: 'Shift Swaps',
        blocks: [
          "If you're unable to work a scheduled shift, we encourage you to first see if another qualified teammate is available to cover it.",
          "Once you've found coverage, submit the shift swap through 7shifts for manager approval.",
          {
            callout: [
              'Until the swap has been approved, the shift is still your responsibility.',
            ],
          },
        ],
      },
      {
        title: 'Calling Off',
        blocks: [
          { h: 'What do I do if I wake up sick, or have an emergency?' },
          "If you're unable to work your scheduled shift because of illness or an emergency, notify your manager as soon as possible. If time allows, we encourage you to try to find coverage. If not, focus on communicating with your manager so we can make a plan.",
          { h: 'No Call / No Show' },
          'If you do not report for your scheduled shift and fail to notify a manager, it is considered a No Call / No Show. Unless extraordinary circumstances exist, we will consider this a voluntary resignation.',
        ],
      },
      {
        title: 'Tardiness',
        blocks: [
          'Being on time means being ready to work at the start of your scheduled shift—not walking through the door at your scheduled start time.',
          "If you're running late, notify a manager as soon as possible. Early communication helps us adjust and support the team until you arrive.",
          'Occasional delays happen, but repeated tardiness places additional responsibility on your teammates and may result in corrective action.',
        ],
      },
      {
        title: 'Holidays',
        blocks: [
          'Due to the nature of the bowling industry, Twisted Pin is open for business every day with the exception of Thanksgiving, Christmas, and the 4th of July. This is subject to change at any time due to business needs.',
          'All employees are expected to work at least two major holidays per year. Our organization believes strongly in work/life balance and will make every effort to accommodate our staff with scheduling on holidays.',
          {
            callout: [
              'New Year’s Eve is a major day for our business. This day is not a holiday.',
              'We require all staff to be available to work that day and night. Requested time off is extremely limited and may not be granted. Please plan accordingly.',
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'time-off',
    title: 'Time Off & Paid Leave',
    blurb: 'Vacation, Illinois Paid Leave (PLAWA), and how hours accrue.',
    sections: [
      {
        title: 'Vacation',
        blocks: [
          'Currently available for salaried, exempt employees only.',
          'This is a front-loaded vacation program where salaried employees are front-loaded each year (January 1) with 40 hours of PTO.',
          'New salaried employees, or an employee entering a salaried position, have a 180-day waiting period to be eligible to use this PTO from date of hire or promotion into a salaried position.',
          'Vacation time is never carried over or accrued in this program.',
        ],
      },
      {
        title: 'Illinois Paid Leave (PLAWA)',
        blocks: [
          'This is a newer program in Illinois and we anticipate it changing over time. We will do our best to keep staff up to date with important changes, and we also encourage you to monitor this law as it evolves.',
          {
            note: 'labor.illinois.gov/laws-rules/paidleave.html',
          },
          { h: 'Some key notes' },
          {
            list: [
              'Hourly staff (non-exempt) earn 1 hour of PTO through PLAWA for every 40 hours worked.',
              'All employees can start using PTO after 90 days of employment.',
              'Minimum leave usage of PTO is 2 hours.',
              'PTO via PLAWA is not paid out upon quitting or termination.',
              'You must request to use PTO — we will never assume you want to use it.',
              'Accrual method (all hourly staff): PLAWA hours do carry over year to year, although the maximum usage is 40 hours per year.',
              'Front-loading method (exempt salaried staff): does not accrue PTO under PLAWA, but rather has 40 hours front-loaded each year on January 1. These front-loaded hours do not carry over year to year.',
              'Salaried staff additionally receive 40 hours of vacation.',
            ],
          },
          { h: 'If you earn below minimum wage' },
          'Tipped employees with hourly rates below minimum wage ($15/hour in 2026) — servers and bartenders, for example — have PTO paid out at the minimum wage level.',
          {
            callout: [
              'If this applies to you, please remind us during PTO requests so you are paid at the minimum wage level.',
            ],
          },
          { h: 'How many hours do I have?' },
          'This PTO policy is automatically managed and calculated by Gusto, based on your hours worked. Gusto provides easy access to review PTO balances, and you can always ask management.',
          'Salaried and exempt staff have PTO front-loaded at 40 hours for the year.',
        ],
      },
      {
        title: 'How Accrual Works (Hourly, Non-Exempt)',
        blocks: [
          'Our 12-month accrual period is January 1 through December 31 (calendar year). All hours began accruing 1/1/24, or upon date of hire.',
          {
            list: [
              '"Accrual" means employees earn 1 hour of paid leave for every 40 hours worked.',
              'Employees accrue up to 40 hours per year.',
              'A part-time, temporary, or seasonal worker is entitled to earn paid leave under the Act, but because they work fewer hours, they might never accrue a full 40 hours of leave in one year.',
            ],
          },
          { h: 'Two examples' },
          {
            list: [
              'Employee A works 10 hours a week, earning 1 hour of paid leave every 4 weeks. Over 50 weeks, that’s approximately 12 hours a year.',
              'Employee B works 20 hours a week, earning 2 hours every 4 weeks. Over 50 weeks, that’s approximately 24 hours a year.',
            ],
          },
          { note: 'Source: Illinois Department of Labor — DOL.PaidLeave@illinois.gov' },
        ],
      },
    ],
  },

  {
    id: 'at-work',
    title: 'At Work',
    blurb: 'Uniforms, appearance, phones, music, smoking and vaping.',
    sections: [
      {
        title: 'Uniform Standards',
        blocks: [
          'We want every teammate to look professional, approachable, and ready to serve our guests.',
          { h: 'Management & Sales' },
          {
            list: [
              'Business casual attire',
              'Twisted Pin-issued shirt, polo, dress shirt or blouse, khakis, dress pants or skirt',
            ],
          },
          { h: 'Hourly Teammates (CSR, Kitchen, Bar, Social Squad)' },
          {
            list: [
              'Twisted Pin logo shirt (t-shirt, polo, zip-up, etc.)',
              'Jeans, khakis, or khaki shorts*',
              'Solid black leggings or yoga pants are acceptable in most positions',
              'Closed-toe shoes are required',
            ],
          },
          '*Kitchen teammates may not wear shorts for safety reasons.',
          { h: 'Not acceptable work attire' },
          {
            list: [
              'Sweatpants',
              'Joggers',
              'Basketball shorts',
              'Clothing with offensive or inappropriate graphics',
            ],
          },
          "If you're cold, wear a long-sleeve shirt under your Twisted Pin shirt or ask management about company-branded outerwear.",
        ],
      },
      {
        title: 'Professional Appearance',
        blocks: [
          'First impressions matter.',
          'Guests often form their opinion of Twisted Pin within seconds of walking through our doors. By wearing a clean uniform, practicing good hygiene, and presenting yourself professionally, you help create a welcoming experience before a single word is spoken.',
        ],
      },
      {
        title: 'Phones & Personal Devices',
        blocks: [
          'Guests come first.',
          'Personal phones are permitted, but they should remain out of sight of guests and only be used briefly when necessary.',
          "If you're expecting an emergency call or message, let your manager or shift leader know before your shift begins.",
          'Repeated misuse of personal devices, especially where guests can see them or when they interfere with your responsibilities, may result in corrective action up to and including termination.',
        ],
      },
      {
        title: 'Music',
        blocks: [
          'Personal earbuds or headphones are not permitted while working.',
          'Kitchen staff may use the approved speaker when appropriate, provided it does not interfere with communication, safety, or the guest experience.',
        ],
      },
      {
        title: 'Smoking & Vaping',
        blocks: [
          'Smoking and vaping are prohibited inside the building and within 15 feet of any entrance.',
          'Please smoke or vape only during approved breaks and when business allows.',
          'Always wash your hands before returning to work.',
        ],
      },
    ],
  },

  {
    id: 'pay-benefits',
    title: 'Pay & Benefits',
    blurb: 'Paydays, timekeeping, overtime, tips, insurance, and 401(k).',
    sections: [
      {
        title: 'Paydays',
        blocks: [
          'Twisted Pin pays employees every other Friday.',
          'Our workweek runs Tuesday through Monday.',
          'Pay is issued through our payroll provider, Gusto.',
          "If you believe there's an error with your paycheck, notify your manager as soon as possible.",
        ],
      },
      {
        title: 'Timekeeping',
        blocks: [
          'All hourly teammates must clock in and out using 7shifts.',
          {
            list: [
              'Clock in no more than 10 minutes before your scheduled shift unless approved.',
              'Clock out promptly when your shift ends unless asked to stay.',
              'Never clock in or out for another teammate.',
              'Working off the clock is not permitted.',
            ],
          },
          'Accurate timekeeping helps ensure everyone is paid correctly.',
        ],
      },
      {
        title: 'Overtime',
        blocks: [
          'Overtime must be approved by a manager in advance.',
          'Non-exempt employees who work more than 40 hours in a workweek will be paid overtime in accordance with applicable law.',
        ],
      },
      {
        title: 'Tips & Gratuities',
        blocks: [
          'All cash tips should be reported when you clock out in 7shifts. Cash tips are not included in our tip pool.',
          "Credit card tips from GoTab are distributed through our tip pool and paid on eligible teammates' paychecks.",
          'Our current tip pool is:',
          {
            table: {
              head: ['Position', 'Tip Pool Share'],
              rows: [
                ['Bartender', '45%'],
                ['Kitchen', '30%'],
                ['Beer Wall Ambassador', '10%'],
                ['CSR', '7.5%'],
                ['Shift Lead', '7.5%'],
              ],
            },
          },
          'Tip pool percentages are reviewed periodically and may be adjusted based on business needs. If changes are made, teammates will be notified.',
          'If you have any questions about how the tip pool works, please speak with a manager.',
        ],
      },
      {
        title: 'Event Gratuities',
        blocks: [
          'Gratuities from catered events are distributed separately from the regular GoTab tip pool.',
          'Event gratuities are manually distributed to the teammates who helped make the event successful, based on the roles they performed during the event. This typically includes the Event Host, Kitchen Team, Bar Team (when applicable), and teammates assisting with bussing or dishes.',
          'If you have questions about an event gratuity, please speak with a manager.',
        ],
      },
      {
        title: 'Benefits',
        blocks: [
          'Twisted Pin is proud to offer a variety of benefits to eligible teammates. Some benefits are available to all employees, while others are based on your employment status or hours worked.',
          { h: 'Health Insurance' },
          "Eligible teammates may enroll in Twisted Pin's health insurance plan after 90 days of employment.",
          'To qualify, you must:',
          {
            list: [
              'Be employed for at least 90 days, and',
              'Be classified as a full-time employee (generally averaging 30 or more hours per week).',
            ],
          },
          { h: 'Dental & Vision Insurance' },
          'Dental and vision coverage is available after 90 days of employment.',
          'Twisted Pin currently offers these plans through Gusto. Employees are responsible for applicable premiums unless otherwise communicated.',
          { h: '401(k) Retirement Plan' },
          'Twisted Pin offers a 401(k) retirement plan through Guideline. Eligible teammates may enroll through Gusto.',
          'Twisted Pin currently matches:',
          {
            list: [
              '100% of employee contributions on the first 3% of pay.',
              '50% of employee contributions on the next 2% of pay.',
            ],
          },
          'Please refer to Guideline and Gusto for current plan details, investment options, and vesting information.',
          'If you believe you qualify, have questions about eligibility, or would like help enrolling, please speak with a manager.',
        ],
      },
    ],
  },

  {
    id: 'safety',
    title: 'Safety & Security',
    blurb: 'Injuries, workers’ comp, guest incidents, weather, emergencies.',
    sections: [
      {
        title: 'Our Commitment to Safety',
        blocks: [
          "Creating a safe environment is everyone's responsibility.",
          "Whether you're looking out for a guest stepping onto the approach, cleaning up a spill, or reporting damaged equipment, your actions help protect our guests, your teammates, and yourself.",
          'If you ever notice something that could create an unsafe situation, notify a manager immediately.',
        ],
      },
      {
        title: 'Workplace Safety',
        blocks: [
          'Every teammate is expected to:',
          {
            list: [
              'Follow all safety procedures for their position.',
              'Use equipment properly.',
              'Report unsafe conditions immediately.',
              'Clean spills and hazards promptly or notify someone who can.',
              'Wear any required safety equipment.',
            ],
          },
          'Failure to follow safety procedures may result in corrective action.',
        ],
      },
      {
        title: 'Employee Injuries',
        blocks: [
          "If you're injured while working—even if the injury seems minor—notify a manager immediately.",
          'Prompt reporting helps us:',
          {
            list: [
              'Get you the care you need.',
              'Complete any required documentation.',
              "Begin the Workers' Compensation process if necessary.",
            ],
          },
          'If emergency medical attention is needed, seek it immediately.',
        ],
      },
      {
        title: "Workers' Compensation",
        blocks: [
          "Twisted Pin provides Workers' Compensation coverage for employees who are injured while performing their job duties.",
          "If you're injured at work:",
          {
            list: [
              'Notify a manager immediately—even if the injury seems minor.',
              'Seek medical attention if needed.',
              'Complete any required incident reports.',
            ],
          },
          "Prompt reporting helps ensure you receive appropriate care and allows us to complete any required Workers' Compensation documentation.",
          'If you have questions about the process, please speak with a manager.',
        ],
      },
      {
        title: 'Guest Injuries',
        blocks: [
          'If a guest is injured or involved in an incident, notify a manager or Shift Leader immediately.',
          'Examples include:',
          {
            list: [
              'Slips, trips, or falls',
              'Lane or equipment injuries',
              'Medical emergencies',
              'Fights or altercations',
              'Any situation requiring first aid or emergency services',
            ],
          },
          'Management will complete the appropriate incident documentation.',
        ],
      },
      {
        title: 'Inclement Weather',
        blocks: [
          'The safety of our guests and teammates is our priority.',
          'When severe weather affects business operations, management will determine whether delays, early closures, or schedule changes are necessary.',
          'If weather may impact your ability to report to work safely, communicate with your manager as early as possible.',
        ],
      },
      {
        title: 'Emergency Procedures',
        blocks: [
          'In the event of an emergency:',
          {
            list: [
              'Stay calm.',
              'Follow the direction of management or emergency responders.',
              'Help guests safely when instructed.',
              'Do not leave your assigned area unless directed to do so.',
            ],
          },
          {
            callout: ['If you are ever unsure what to do, ask a manager immediately.'],
          },
        ],
      },
    ],
  },

  {
    id: 'expectations',
    title: 'Workplace Expectations',
    blurb: 'Harassment, violence, parking, visitors, corrective action, substances.',
    sections: [
      {
        title: 'Harassment-Free Workplace',
        blocks: [
          'Everyone deserves to work in an environment where they feel respected, valued, and safe.',
          'Twisted Pin does not tolerate harassment, discrimination, bullying, or retaliation of any kind. This includes conduct based on race, color, religion, sex, sexual orientation, gender identity, national origin, age, disability, or any other characteristic protected by law.',
          'Harassment may include unwanted comments, jokes, gestures, physical contact, intimidation, or any behavior that creates an intimidating, hostile, or offensive work environment.',
          'If you experience or witness harassment, discrimination, or retaliation, report it to a manager, the General Manager, or Ownership as soon as possible. Every report will be taken seriously and investigated promptly.',
          {
            callout: [
              'Retaliation against anyone who makes a good-faith report or participates in an investigation is strictly prohibited.',
            ],
          },
          'Violations of this policy may result in disciplinary action, up to and including termination.',
        ],
      },
      {
        title: 'Workplace Violence',
        blocks: [
          'Twisted Pin is committed to providing a safe workplace for both teammates and guests.',
          'Threats, intimidation, fighting, or acts of violence will not be tolerated and may result in immediate disciplinary action, up to and including termination.',
          'If you witness behavior that concerns you, notify a manager immediately.',
        ],
      },
      {
        title: 'Parking',
        blocks: [
          'Free parking is available for all teammates.',
          'To help provide the best possible experience for our guests, please park toward the sides of the parking lot whenever possible and leave the closest spaces near the front entrance available for guests.',
          'Twisted Pin is not responsible for loss, theft, or damage to personal vehicles or belongings. Please lock your vehicle and avoid leaving valuables in plain sight.',
        ],
      },
      {
        title: 'Visitors',
        blocks: [
          "Friends and family are always welcome to visit Twisted Pin as guests—but while you're working, your focus should remain on your job and our guests.",
          'If friends or family stop by during your shift, please keep conversations brief and avoid allowing visits to interfere with your responsibilities or the operation of the business.',
          "If you're off the clock and visiting Twisted Pin, remember that you're a guest. Please be mindful of teammates who are working and avoid disrupting service.",
        ],
      },
      {
        title: 'Corrective Action',
        blocks: [
          'Our goal is always to coach before we correct.',
          'Depending on the situation, corrective action may include verbal coaching, written documentation, suspension, or termination. Some serious violations may result in immediate termination.',
          'Every situation is unique, and Twisted Pin reserves the right to determine the appropriate level of corrective action based on the circumstances.',
        ],
      },
      {
        title: 'Drug & Alcohol-Free Workplace',
        blocks: [
          'Twisted Pin is committed to maintaining a safe, healthy workplace.',
          'Employees may not report to work under the influence of alcohol, cannabis, illegal drugs, or any substance that impairs their ability to safely perform their job.',
          'The unlawful possession, use, distribution, or sale of controlled substances while working or on company property is prohibited and may result in disciplinary action, up to and including termination.',
          'If you’re taking a prescribed medication that may affect your ability to safely perform your job, please notify management so we can determine the appropriate next steps.',
        ],
      },
    ],
  },

  {
    id: 'perks',
    title: 'Perks of the Job',
    blurb: 'Free bowling, food and drink, growth, and team events.',
    sections: [
      {
        blocks: [
          'Working at Twisted Pin comes with more than just a paycheck.',
          'We love creating great experiences for our guests, and we want our teammates to enjoy them too.',
        ],
      },
      {
        title: 'Free Bowling',
        blocks: [
          'Employees are welcome to bowl free of charge whenever lanes are available and there is no guest waiting list.',
          'Rental shoes are included.',
          "Free bowling is available for you, your spouse, children, stepchildren, grandchildren, and parents when they're bowling with you.",
          "Let the front desk know you're an employee when checking in.",
          "If a wait list develops, we may ask you to return your lane so we can accommodate our guests. You're welcome to continue bowling at the current retail rate if lanes remain available.",
        ],
      },
      {
        title: 'Food & Beverage Discount',
        blocks: [
          'All teammates receive:',
          {
            list: [
              'Complimentary fountain beverages while working.',
              '50% off food purchased for their own consumption.',
            ],
          },
          'This discount is intended for the employee only and may not be used for friends or family members.',
          "If you'd like to use your discount while off duty, please check with a manager.",
        ],
      },
      {
        title: 'Learning & Growth',
        blocks: [
          'We believe the best teammates never stop learning.',
          "Whether it's learning a new position, taking on additional responsibilities, or developing leadership skills, we're committed to helping teammates grow within Twisted Pin.",
          "If you're interested in learning something new or exploring future opportunities, let your manager know—we'd love to help you get there.",
        ],
      },
      {
        title: 'Team Events',
        blocks: [
          'We enjoy celebrating together throughout the year with team outings, appreciation events, holiday gatherings, and other opportunities to connect outside of work.',
          "While not every event is mandatory, we encourage you to join us whenever you can. They're a great way to build friendships and celebrate everything we've accomplished together.",
        ],
      },
    ],
  },
];
