/**
 * The Twisted Pin Playbook — chapter content.
 *
 * PART ONE IS LOCKED. Every chapter below is final and transcribed verbatim
 * from Context/Twisted Pin Playbook.txt. Do not rewrite, tighten, "improve,"
 * or de-duplicate this copy. If a chapter reads oddly, that's the voice —
 * short lines, heavy white space, one thought per paragraph. It's built to be
 * read like a keynote, not a document.
 *
 * AUTHORIZED REVISIONS TO LOCKED COPY (Jon asked for these directly — "do not
 * rewrite unless specifically instructed" is exactly what that means):
 *   · 2026-07-20 — "Details Matter", the proposal story: the three-sentence
 *     "One teammate stayed with him…" passage became the "It was a true team
 *     effort…" version, adding the phone, the photos, and the hand-off to the
 *     teammate at the computer. `Context/Twisted Pin Playbook.txt` was updated
 *     in the same commit so the two never drift — if you find them
 *     disagreeing, the source file is stale, not this one.
 *
 * ONE FORMATTING NOTE (not a rewrite): the "Notice The Moments" story arrived
 * in the source file as a single run-on paragraph — clearly a paste that lost
 * its line breaks, since every other story in the book uses the beat rhythm.
 * Line breaks were restored WITHOUT changing a single word. Flagged to Jon.
 *
 * PART TWO (The Guidebook) gets appended to this same file as it's written.
 * Match the voice: teach the policy, explain the why, use the real story
 * whenever there is one.
 *
 * BLOCK TYPES
 *   'a string'      → paragraph / beat (the default; most of the book)
 *   { h: '...' }    → subheading inside a section
 *   { q: '...' }    → pull quote (guest or teammate speech, set large)
 */

export type Block = string | { h: string } | { q: string };

export interface Section {
  /** Small caps label above the section title, e.g. "Twisted Pin Moment". */
  eyebrow?: string;
  title?: string;
  blocks: Block[];
}

/**
 * A chapter photograph. `name` is the base filename under
 * `/public/playbook/<name>-{w}.{avif,webp,jpg}` produced by
 * `scripts/build-playbook-images.mjs`. `alt` is required (staff page, but
 * screen-reader teammates still read it). `caption` is shown only in the
 * timeline layout (Our Story).
 */
export interface Photo {
  name: string;
  alt: string;
  caption?: string;
}

export interface Chapter {
  id: string;
  part: 'front' | 'one' | 'two';
  /** Displayed chapter title. */
  title: string;
  /** Label on the button that advances to the NEXT chapter. Pulled from the
   *  "Next CTA" lines in the source Developer Notes where they exist. */
  nextLabel?: string;
  sections: Section[];
  /** Art direction from the source Developer Notes — kept in code so whoever
   *  drops real photography in later knows what the chapter is asking for. */
  imageNote?: string;
  /**
   * Real photography, rendered at the top of the chapter (2026-07-20, Jon's
   * picks). One entry → full-width 3:2 hero. Two or more → a two-up gallery of
   * 4:5 tiles. `photoLayout: 'timeline'` switches the gallery to 3:2 landscape
   * tiles with visible captions (Our Story's Pioneer → Plainfield → Twisted
   * Pin arc). Presentational only — the SEARCH index never reads these.
   */
  photos?: Photo[];
  photoLayout?: 'gallery' | 'timeline';
}

export const CHAPTERS: Chapter[] = [
  // ─────────────────────────────────────────── FRONT MATTER
  {
    id: 'hero',
    part: 'front',
    title: 'The Twisted Pin Playbook',
    nextLabel: 'Come On In',
    imageNote: 'Leave space for a great full-bleed photo of the building or a full house.',
    sections: [
      {
        title: 'More Than a Handbook.',
        blocks: [
          "This isn't just a collection of policies.",
          "It's the story of who we are.",
          'The values we live.',
          'The moments we create.',
          'And the people who make them possible.',
          "Inside these pages, you'll learn more than what we do.",
          "You'll learn how we think.",
          "Because great hospitality isn't built by rules.",
          "It's built by people.",
          'Welcome to Twisted Pin.',
        ],
      },
    ],
  },
  {
    id: 'welcome',
    part: 'front',
    title: 'Welcome to the Twisted Pin Fam',
    nextLabel: 'How It All Began',
    imageNote:
      'Candid photo of teammates laughing, celebrating, or helping one another. Avoid posed corporate-style photos.',
    photos: [
      {
        name: 'welcome',
        alt: 'The Twisted Pin team together in Halloween costumes, arms around one another and laughing.',
      },
    ],
    sections: [
      {
        blocks: [
          "We're so glad you're here.",
          "Out of all the places you could have chosen to work, you chose Twisted Pin—and we don't take that lightly.",
          "Whether this is your very first job, your first job in hospitality, or the next chapter in your career, you've become part of something special.",
          "Around here, you'll probably hear people talk about the Twisted Pin Fam. That's not just a nickname—it's how we think about one another.",
          'We celebrate wins together. We jump in when someone needs help. We learn from mistakes. We cheer each other on. And we work hard to create an environment where people genuinely enjoy coming to work.',
          "That doesn't mean we're perfect. Every team has busy days, stressful moments, and opportunities to grow. But we believe the best teams communicate openly, assume positive intent, and always remember that we're working toward the same goal.",
          "As you read through this Playbook, you'll learn about our story, our values, and the role every teammate plays in creating unforgettable experiences for our guests.",
          "This isn't just a guide to how we work.",
          "It's an invitation to become part of something bigger than yourself.",
          "We're honored you chose to be here.",
          'Welcome to the Twisted Pin Fam.',
        ],
      },
    ],
  },
  {
    id: 'dedication',
    part: 'front',
    title: 'Dedication',
    nextLabel: 'Discover Our History',
    imageNote:
      'A collage of real Twisted Pin moments—teammates, guests celebrating, league nights, birthday parties, community events, behind-the-scenes teamwork. Authentic and lived-in rather than staged.',
    photos: [
      {
        name: 'dedication',
        alt: 'Twisted Pin teammates holding the Herald-News "Best Bowling Alley in Will County 2025" plaque.',
      },
    ],
    sections: [
      {
        blocks: [
          'This Playbook is dedicated to every person who has helped shape Twisted Pin into what it is today.',
          'To the guests who have trusted us with birthdays, first dates, anniversaries, fundraisers, league nights, celebrations, and ordinary Tuesdays that somehow became unforgettable.',
          'To the teammates who showed up early, stayed late, solved problems, stepped in without being asked, and cared deeply about the people around them.',
          'To the leaders who believed that building a great team mattered just as much as building a great business.',
          'And to the future teammates reading this now.',
          'Every smile, every high five, every celebration, every challenge, and every lesson learned has helped write the story of Twisted Pin.',
          'Now...',
          'You get to help write the next chapter.',
          'This Playbook is for you.',
        ],
      },
    ],
  },
  {
    id: 'our-story',
    part: 'front',
    title: 'Our Story',
    nextLabel: 'Why We Exist',
    imageNote:
      'Horizontal timeline with three milestones: Pioneer Lanes → Plainfield Lanes → Twisted Pin, each with a historic photo and short caption. Plus a photo of brothers Chris & Jon.',
    photoLayout: 'timeline',
    photos: [
      { name: 'our-story-pioneer', alt: 'The Pioneer Lanes storefront, the bowling center as it was when the Dow brothers bought it in 2014.', caption: 'Pioneer Lanes — 2014' },
      { name: 'our-story-plainfield', alt: 'The same building rebranded as Plainfield Lanes, with new grey siding and signage.', caption: 'Plainfield Lanes' },
      { name: 'our-story-twistedpin', alt: 'The Twisted Pin sign being installed on the building at sunset by a North Shore Sign crane crew.', caption: 'Twisted Pin — 2023' },
      { name: 'our-story-brothers', alt: 'Brothers Jon and Chris Dow together, dressed up and smiling in a field.', caption: 'Jon & Chris Dow' },
    ],
    sections: [
      {
        blocks: [
          'Every great journey has a beginning.',
          'Ours began long before the name Twisted Pin ever appeared on the building.',
          'In 2014, brothers Jon and Chris Dow purchased what was then known as Pioneer Lanes, a bowling center that had proudly served the Plainfield community for 17 years.',
          "They didn't just see a bowling center.",
          'They saw potential.',
          'A place where birthdays could become traditions.',
          'Where coworkers could become friends.',
          'Where families could reconnect.',
          'Where ordinary nights could become unforgettable memories.',
          'As a new chapter began, Pioneer Lanes became Plainfield Lanes—a name that honored the community while reflecting its new ownership.',
          'For nearly a decade, Plainfield Lanes became a place of growth, learning, and transformation. During those years, the team invested not only in the building, but in something even more important: creating an experience guests couldn’t find anywhere else.',
          'By 2023, it was clear the business had grown into something much bigger than a bowling center.',
          "It had become a place where people gathered to celebrate life's biggest moments, reconnect with loved ones, and create lasting memories together.",
          'To reflect that vision, Plainfield Lanes officially became Twisted Pin—a name that better represented who we had become and where we were headed.',
          'Today, Twisted Pin is more than a bowling and entertainment center.',
          "It's where birthdays are celebrated.",
          'Where first dates begin.',
          'Where championships are won.',
          'Where coworkers become lifelong friends.',
          'Where families reconnect.',
          'Where memories are made.',
          'Our building has changed.',
          'Our name has changed.',
          'Our logo has changed.',
          'But one thing never has.',
          'People have always been at the heart of our story.',
          'Every guest.',
          'Every celebration.',
          'Every teammate.',
          'Every memory.',
          "That's what has shaped Twisted Pin from the very beginning.",
          'And now...',
          "It's your turn to help write the next chapter.",
        ],
      },
    ],
  },

  // ─────────────────────────────────────────── PART ONE
  {
    id: 'our-purpose',
    part: 'one',
    title: 'Our Purpose',
    nextLabel: 'The Way We Show Up',
    imageNote:
      'Real guests celebrating—a child blowing out birthday candles, friends laughing at the lanes, a couple sharing a toast, teammates high-fiving after a successful event. Focus on emotion more than bowling.',
    photos: [
      {
        name: 'our-purpose',
        alt: 'A mother and her son sharing a toast at a table, both grinning at the camera.',
      },
    ],
    sections: [
      {
        eyebrow: 'Twisted Pin Moment',
        title: 'Around Here... The Host Gets to Be a Guest',
        blocks: [
          'A family had booked a graduation party at Twisted Pin.',
          'Like so many hosts, Mom spent the first part of the event doing what hosts often do—making sure everyone else was taken care of.',
          'She was answering questions.',
          'Checking on guests.',
          'Trying to keep everything running smoothly.',
          'One of our teammates noticed.',
          'Without being asked, they stepped in.',
          'They made sure the food came out at the right time.',
          'Helped direct guests where they needed to go.',
          'Offered to take family photos so Mom could be in them instead of behind the camera.',
          'And before long, they placed a cocktail in her hand and encouraged her to enjoy the celebration she had worked so hard to plan.',
          'At the end of the event, she said something our team has never forgotten.',
          { q: 'I actually got to enjoy today.' },
          "That's what we're here for.",
          "Our job isn't just to host the event.",
          "It's to help the host become a guest.",
        ],
      },
      {
        title: 'Our Purpose',
        blocks: [
          "People often think we're in the bowling business.",
          "They're only half right.",
          "We're in the memory-making business.",
          'Bowling just happens to be where those memories begin.',
          'Every day, people walk through our doors to celebrate something.',
          'A birthday.',
          'A first date.',
          'A reunion.',
          'A championship.',
          'A promotion.',
          'A family night out.',
          'Or maybe...',
          'They simply needed a reason to laugh together after a long week.',
          'Those moments matter.',
          "And while our guests may remember the strikes they threw or the meal they enjoyed, what they'll remember most is how we made them feel.",
          'A warm welcome.',
          'A genuine smile.',
          'Someone who noticed they needed help before they had to ask.',
          'A team that cared enough to make an ordinary visit feel extraordinary.',
          "That's why every role matters.",
          "Whether you're greeting guests, serving food, mixing drinks, fixing a lane, washing dishes, or working behind the scenes, you're helping create moments people will remember long after they leave.",
          'Around here, we believe Twisted Pin is a local escape.',
          'A place where the stress of the day fades away.',
          'Where laughter replaces to-do lists.',
          'Where families reconnect.',
          'Where friends make memories.',
          'Where, for just a little while, life slows down.',
          "Because at the end of the day, we aren't measured by how many games we sold.",
          "We're measured by the memories people take home with them.",
        ],
      },
    ],
  },
  {
    id: 'our-culture',
    part: 'one',
    title: 'Our Culture',
    nextLabel: 'One Goal. One Team. One Family.',
    photos: [
      {
        name: 'our-culture',
        alt: 'Teammates and guests building tall pyramids of stacking cups together at an event.',
      },
    ],
    sections: [
      {
        blocks: [
          "Culture isn't something you can hang on a wall.",
          "It's something you experience.",
          "It's the teammate who jumps in without being asked.",
          "The bartender who remembers a regular's favorite drink.",
          'The kitchen team that rallies together during a dinner rush.',
          'The CSR who notices a disappointed birthday child and finds a way to turn the day around.',
          'The manager who takes time to coach instead of criticize.',
          "The host who greets every guest like they're walking into their own home.",
          "Those moments don't happen because they're written in a handbook.",
          'They happen because of the choices we make every day.',
          'At Twisted Pin, our culture is built one interaction at a time—with our guests and with one another.',
          "It's choosing kindness.",
          'Taking ownership.',
          'Helping without keeping score.',
          'Cheering each other on.',
          'Learning from mistakes.',
          "Doing what's right because that's who we are.",
          "Because creating unforgettable memories isn't the responsibility of one department.",
          "It's something every one of us contributes to, every single day.",
          "The pages that follow aren't just values.",
          "They're the promises we make to each other, to our guests, and to ourselves.",
          'This is how we show up.',
          'This is how we work.',
          'This is how we create unforgettable memories.',
          'Together.',
        ],
      },
    ],
  },
  {
    id: 'better-together',
    part: 'one',
    title: 'Better Together',
    nextLabel: 'Own the Outcome',
    photos: [
      { name: 'better-together-1', alt: 'A teammate plating fresh pizza along a catered buffet line during an event.' },
      { name: 'better-together-2', alt: 'The VIP suite mid-event: families eating pizza at the lanes under the VIP 1–3 signs.' },
      { name: 'better-together-3', alt: 'Two teammates smiling as they serve pizza and salad at an event setup.' },
    ],
    sections: [
      {
        eyebrow: 'Twisted Pin Moment',
        title: 'Better Together',
        blocks: [
          'One Friday night, every lane in the building was full.',
          "That wasn't unusual.",
          'What made this night different was what was happening behind the scenes.',
          "We weren't hosting one large event.",
          'We were hosting seven.',
          'Seven catered events.',
          'Seven different timelines.',
          'Seven celebrations.',
          'At the same time, open play guests were filling the lanes, the arcade was buzzing, the kitchen was serving both catered events and restaurant orders, the bar was busy, and our front desk was managing a growing waitlist.',
          'It was one of the most complex nights Twisted Pin had ever managed.',
          'Yet if you had walked through our front doors, you never would have known.',
          'To our guests, it was just another great Friday night.',
          'The kitchen knew exactly when each buffet needed to be ready.',
          'Event Hosts kept celebrations moving from one moment to the next.',
          'CSRs welcomed guests, answered questions, and kept the waitlist moving.',
          'Bartenders mixed drinks while helping guests celebrate birthdays, anniversaries, and victories.',
          'Managers floated from one area to another, stepping in wherever they were needed.',
          'Nobody waited to be told what to do.',
          "Nobody stopped to ask whose job something was.",
          'Everyone understood that every role mattered.',
          'Because when every piece of the puzzle came together, seven celebrations, a full bowling center, a busy arcade, and a packed restaurant and bar all felt effortless to our guests.',
          "That's what being Better Together looks like.",
        ],
      },
      {
        title: 'One Goal. One Team. One Family.',
        blocks: [
          'Every role matters.',
          'Every shift matters.',
          'Every interaction matters.',
          'Because every guest who walks through our doors is trusting us with part of their story.',
          "Some are celebrating life's biggest milestones.",
          'Others are simply looking for two hours where they can laugh, relax, and forget about everything else.',
          'No matter what brings them here...',
          'We have one goal: to make their story even better.',
          { h: 'One Team.' },
          'At Twisted Pin, there are no sidelines.',
          'If someone needs help, we step in.',
          'If a teammate is overwhelmed, we jump in.',
          'If we see something that needs to be done, we take ownership.',
          'We don’t say, "That’s not my job."',
          "Because our guests don't see departments.",
          "They don't know who's a CSR, bartender, kitchen team member, host, or manager.",
          'They simply see Twisted Pin.',
          'And every interaction shapes their experience.',
          { h: 'One Family.' },
          'Families celebrate together.',
          'Families support one another.',
          'Families have honest conversations.',
          'Families give grace.',
          'Families cheer each other on.',
          'Families help each other grow.',
          "We're not perfect.",
          "We'll make mistakes.",
          "We'll have busy days and difficult moments.",
          "But we face them together—with respect, trust, and the shared belief that we're always stronger as one team than we could ever be alone.",
          'Because when one of us succeeds...',
          'We all succeed.',
          { h: 'One Goal.' },
          'To create unforgettable memories.',
          { h: 'One Team.' },
          "Working together to make every guest's story even better.",
          { h: 'One Family.' },
          "Building something we're proud to be part of.",
        ],
      },
    ],
  },
  {
    id: 'own-the-outcome',
    part: 'one',
    title: 'Own the Outcome',
    nextLabel: 'Protect the Experience',
    photos: [
      { name: 'own-the-outcome-1', alt: 'A young boy giving a thumbs up while wearing a balloon octopus hat at the lanes.' },
      { name: 'own-the-outcome-2', alt: 'Two teammates in Harley Quinn and Batgirl costumes posing with a delighted birthday girl.' },
    ],
    sections: [
      {
        eyebrow: 'Twisted Pin Moment',
        title: 'Around Here... Nobody Celebrates Alone',
        blocks: [
          'One afternoon, a young boy arrived for his birthday party, full of excitement.',
          'The decorations were up.',
          'The food was ready.',
          'The lanes were waiting.',
          'There was just one problem.',
          'No one came.',
          "For reasons outside of anyone's control, his guests never arrived.",
          'Instead of quietly cleaning up and moving on, our team made a different choice.',
          'One by one, teammates began stopping by his lane.',
          'Someone bowled a game with him.',
          'Someone wished him a happy birthday.',
          'Someone cheered him on after every strike.',
          'Someone made him laugh.',
          'For a little while, the people working that day became his party guests.',
          'When it was time to celebrate, our team gathered around with his birthday dessert and sang as if the room were full.',
          "Because in that moment, it wasn't about whose job it was.",
          "It was about making sure one little boy didn't spend his birthday feeling forgotten.",
          "That's what taking ownership looks like.",
          'Not waiting for someone else to fix the situation.',
          'Not saying, "There’s nothing we can do."',
          'Stepping in.',
          'Doing something.',
          'Making the experience better.',
          'Because around here...',
          'Nobody celebrates alone.',
        ],
      },
      {
        title: 'Own the Outcome',
        blocks: [
          'Every interaction is an opportunity.',
          'Every challenge is a choice.',
          "When something doesn't go as planned, we don't waste time looking for someone else to fix it.",
          'We ask ourselves:',
          { q: 'What can I do to make this better?' },
          'We may not always control the situation.',
          'But we can always control how we respond.',
          'Sometimes the answer is solving the problem yourself.',
          "Sometimes it's asking for help.",
          "Sometimes it's simply staying calm and showing a guest that you genuinely care.",
          "Owning the outcome doesn't mean having all the answers.",
          'It means taking responsibility for finding one.',
          'It means following through.',
          'It means keeping your promises.',
          "It means treating every guest's experience as if it were your own.",
          'Because one small moment can change how someone remembers their entire visit.',
          "The best teammates don't wait for someone else to step in.",
          'They notice.',
          'They care.',
          'They act.',
          'Not because someone is watching.',
          "But because that's who they are.",
          "At Twisted Pin, we don't just own our jobs.",
          'We own the experience.',
        ],
      },
    ],
  },
  {
    id: 'protect-the-experience',
    part: 'one',
    title: 'Protect the Experience',
    nextLabel: 'Notice the Moments',
    photos: [
      { name: 'protect-1', alt: 'Two small kids hugging and proudly holding up their Twisted Pin arcade game cards.' },
      { name: 'protect-2', alt: 'A birthday girl in her crown ribbon and glowing light-up necklace, smiling by the lanes.' },
    ],
    sections: [
      {
        eyebrow: 'Twisted Pin Moment',
        title: 'Sometimes the Best "No" Ends With a Smile',
        blocks: [
          'One afternoon, a family walked into Twisted Pin carrying a birthday cake, balloons, and decorations.',
          'They were excited.',
          'They had planned to celebrate a birthday together.',
          'The only problem?',
          "They hadn't reserved a party.",
          'They had simply booked bowling lanes.',
          "Our policy doesn't allow outside food or birthday celebrations with regular lane reservations.",
          "Not because we don't want people to celebrate.",
          'But because those policies help us create a great experience for everyone in the building.',
          'It would have been easy to simply say,',
          { q: "I'm sorry, that's against our policy." },
          'Instead, our teammate took the time to explain why the policy existed.',
          'Then they looked for another way to make the birthday feel special.',
          'The birthday child received an arcade game card.',
          'She got to reach into the ticket multiplier bag.',
          'We even made sure to add a candle to the dessert the family ordered and sang happy birthday.',
          'And a few extra moments of excitement that nobody expected.',
          'The family understood.',
          'The child left smiling.',
          'And the celebration continued.',
          "Because protecting the experience doesn't mean saying no.",
          'It means finding another way to say yes.',
        ],
      },
      {
        title: 'Protect the Experience',
        blocks: [
          'Every guest remembers something.',
          "Maybe it's the strike they finally bowled.",
          "The cocktail they can't stop talking about.",
          'The birthday party their child still brings up months later.',
          'The server who remembered their name.',
          'Or the teammate who turned a frustrating moment into a great story.',
          'They may not remember every detail.',
          "But they'll always remember how we made them feel.",
          "That's why we protect the experience.",
          'We notice when a table needs to be wiped.',
          "We pick up the piece of trash that isn't ours.",
          'We refill the napkins before someone has to ask.',
          'We greet guests before they wonder where to go.',
          'We fix small problems before they become big ones.',
          'We never walk past something that needs our attention.',
          'Because every detail tells our guests something about who we are.',
          'Protecting the experience also means protecting each other.',
          'Helping before someone has to ask.',
          'Speaking with respect.',
          'Keeping our spaces clean, safe, and ready.',
          "Taking pride in the place you're helping create.",
          'Leaving things better than we found them.',
          'The little things matter.',
          "Because they're rarely little to the guest.",
          'Every decision we make either adds to the experience...',
          'Or takes away from it.',
          'Choose to make it better.',
        ],
      },
    ],
  },
  {
    id: 'notice-the-moments',
    part: 'one',
    title: 'Notice the Moments',
    nextLabel: 'Everyone Belongs',
    photos: [
      {
        name: 'notice-the-moments',
        alt: 'An older guest on his feet mid-celebration, raising a glass and cheering at the lanes.',
      },
    ],
    sections: [
      {
        eyebrow: 'Twisted Pin Moment',
        title: 'Around Here... We Celebrate What Matters to Our Guests',
        blocks: [
          'Some guests come to Twisted Pin to bowl.',
          'Some come to celebrate.',
          'And sometimes...',
          "They come because they're simply waiting for life to happen.",
          'One evening, a grandfather-to-be struck up a conversation with one of our team members.',
          'His daughter was expecting her first baby.',
          'She was already overdue.',
          'The whole family had been anxiously waiting for labor to begin, so they decided to get out of the house, go bowling together, and see if maybe a little fun would help pass the time.',
          'He wanted to do something special for his daughter.',
          "He just wasn't sure what.",
          'As we talked with him, you could tell how excited he was.',
          "He wasn't really asking about dessert.",
          'He wanted to share his excitement with someone.',
          'We suggested one of our fried donut sundaes.',
          'Then someone remembered hearing that peppermint is sometimes said to help encourage labor.',
          'So we sprinkled crushed peppermint on top, added a birthday candle, and joked, "Maybe this will trick the baby into thinking it’s his birthday."',
          'Normally, we would have delivered the dessert ourselves.',
          'Instead, we handed it to the grandfather-to-be.',
          'He smiled, carried it across the room, and proudly presented it to his daughter.',
          "You could tell that wasn't just a sundae.",
          'It was a grandfather celebrating the family he was about to welcome.',
          "That's why we love this story.",
          "Not because we created something that wasn't on the menu.",
          "But because, for a few minutes, we got to be part of someone else's joy.",
          "Sometimes hospitality isn't about serving food.",
          "It's about celebrating what matters to the people sitting in front of you.",
          'Because around here...',
          'The best memories are often made in the smallest moments.',
        ],
      },
      {
        title: 'Notice the Moments',
        blocks: [
          'Great hospitality begins with paying attention.',
          'Listen carefully.',
          'Notice what guests are celebrating.',
          'Watch for opportunities to surprise someone.',
          'Sometimes the smallest gesture becomes the biggest memory.',
          'A kind word.',
          'A handwritten note.',
          'A birthday candle.',
          'A personalized drink.',
          'A photo.',
          "Those moments can't be found on a checklist.",
          'They come from teammates who are paying attention.',
          "When we notice what matters to our guests, we create experiences they'll remember long after they've left Twisted Pin.",
        ],
      },
    ],
  },
  {
    id: 'everyone-belongs',
    part: 'one',
    title: 'Everyone Belongs',
    nextLabel: 'Communicate Early',
    photos: [
      { name: 'everyone-belongs-1', alt: 'Joe behind the bar, grinning as he finishes a bubble-domed craft cocktail.' },
      { name: 'everyone-belongs-2', alt: 'A couple laughing together over a game of skeeball in the arcade.' },
    ],
    sections: [
      {
        eyebrow: 'Twisted Pin Moment',
        title: 'More Than Just a Drink',
        blocks: [
          'A group of friends came in to celebrate an upcoming wedding.',
          'As the night went on, one of our bartenders noticed something.',
          "The bride- and groom-to-be hadn't been up to the bar.",
          'Instead of waiting for them to order, he got curious.',
          'He asked the host if either of them had a favorite drink.',
          'The friends laughed.',
          { q: "The bride doesn't really drink." },
          '"And honestly... the groom doesn’t drink much either. He’s just recently started getting into whiskey."',
          'The bartender asked if the groom would come over for a minute.',
          '"So," he said, "what do you usually like?"',
          'The groom shrugged.',
          '"I’ve been getting into whiskey... but I don’t really want to drink it straight tonight."',
          'Then he added...',
          '"I do love Dr Pepper."',
          'The bartender smiled.',
          '"Alright, man. I got you."',
          'A few minutes later, he came back with something completely custom.',
          'Inspired by a Manhattan, but with a small float of Dr Pepper to complement the cherry notes from the Luxardo cherry.',
          'The groom took a sip.',
          'Then another.',
          'A huge smile spread across his face.',
          'A few of his friends tried it...',
          '...and immediately ordered one for themselves.',
          'Two days later, we received an email.',
          'Not asking about event details.',
          'Not asking about bowling.',
          'They wanted to know one thing:',
          'Did the bartender remember the recipe?',
          "The groom couldn't stop talking about it.",
        ],
      },
      {
        title: 'Everyone Belongs',
        blocks: [
          'Hospitality is personal.',
          'Every guest walks through our doors with a different story.',
          'Different personalities.',
          'Different preferences.',
          'Different comfort levels.',
          'Some guests will be celebrating loudly.',
          'Others will be quiet.',
          'Some know exactly what they want.',
          'Others need a little guidance.',
          "Our job isn't to treat everyone the same.",
          "It's to make everyone feel welcome.",
          'Learn names.',
          'Ask questions.',
          'Listen.',
          'Notice preferences.',
          'Find ways to personalize the experience.',
          'Because when guests feel like they belong...',
          "They don't just remember the food or the bowling.",
          'They remember how we made them feel.',
        ],
      },
    ],
  },
  {
    id: 'communicate-early',
    part: 'one',
    title: 'Communicate Early',
    nextLabel: 'Details Matter',
    photos: [
      {
        name: 'communicate-early',
        alt: 'A mother and daughter cheek to cheek, both smiling for a photo at the lanes.',
      },
    ],
    sections: [
      {
        eyebrow: 'Twisted Pin Moment',
        title: 'Communicate Early',
        blocks: [
          'One evening, an order ticket never made it to the kitchen.',
          "While other guests were enjoying their meals, one family's food hadn't even been started.",
          'As soon as we realized what had happened, we had a choice.',
          "We could quietly rush the order and hope they wouldn't notice.",
          'Or...',
          'We could be honest.',
          'A teammate went straight to the lane.',
          'They explained what had happened, apologized, and let the guests know their food was being prepared right away.',
          "But we didn't stop there.",
          'While they waited, we brought out fresh chips and salsa.',
          'Something quick.',
          'Something easy.',
          'Something to enjoy while the kitchen caught up.',
          'When the food was finally ready, we brought it out with a smile—and one more surprise.',
          "The family hadn't ordered dessert.",
          'So we treated them to an order of our fried donuts.',
          'Not because we had to.',
          'Because we wanted the last thing they remembered to be how we handled the situation, not the mistake itself.',
          'Mistakes happen.',
          'What matters is what happens next.',
          "Guests are incredibly understanding when they're kept informed.",
        ],
      },
      {
        title: 'Communicate Early',
        blocks: [
          'Mistakes happen.',
          'Delays happen.',
          'Plans change.',
          'What matters most is how we respond.',
          "When something doesn't go as expected, communicate early.",
          'Be honest.',
          'Be proactive.',
          'Keep guests informed.',
          "Don't make them wonder what's happening.",
          "Most guests are incredibly understanding when they know what's going on.",
          'Silence creates frustration.',
          'Communication builds trust.',
          "If you don't know the answer yet, that's okay.",
          "Tell the guest you're looking into it, then follow through.",
          'Never leave someone guessing.',
          "Because the hardest part isn't waiting.",
          "It's wondering.",
        ],
      },
    ],
  },
  {
    id: 'details-matter',
    part: 'one',
    title: 'Details Matter',
    nextLabel: 'Safety Matters',
    photos: [
      { name: 'details-matter-1', alt: 'A guest down on one knee proposing at the VIP lanes as his partner reacts with joy.' },
      { name: 'details-matter-2', alt: 'A newly engaged couple in front of the "Will you marry me?" video wall, showing off the ring.' },
    ],
    sections: [
      {
        eyebrow: 'Twisted Pin Moment',
        title: 'Behind Every "Yes"',
        blocks: [
          'Earlier that day, we got a phone call.',
          'A guest had a plan.',
          'He was going to propose.',
          'He was nervous.',
          'Really nervous.',
          'Friends and family were in on the surprise, and a photo was sent over so we could have everything ready on the video wall.',
          'It was a true team effort. One teammate stayed with him, offering a final pep talk. Another stood nearby on the phone, ready to give the signal (while snapping a few photos!) to a teammate waiting at the computer, prepared to switch the screen at exactly the right moment.',
          'She stepped up to bowl.',
          'The ball rolled down the lane.',
          'The screen changed.',
          'She turned around...',
          '...and he was on one knee.',
          'The cheers could be heard right through the phone.',
          'Champagne was waiting.',
          'Photos were taken.',
          'Within minutes, their very first photo as fiancés was up on the video wall.',
          { q: 'SHE SAID YES!' },
          'Congratulations and best wishes on a beautiful life together from your Twisted Pin family.',
          "The excitement didn't end there.",
          'Our team was buzzing for the rest of the night.',
          'Not because we pulled off a surprise.',
          "Because we got to be part of one of the biggest moments in someone else's life.",
          "And that's something we'll never take for granted.",
        ],
      },
      {
        title: 'Details Matter',
        blocks: [
          'The little things matter.',
          'The details guests never see are often the ones that make the biggest difference.',
          'Preparing ahead.',
          'Communicating with one another.',
          'Double-checking the plan.',
          'Thinking one step ahead.',
          'Anticipating needs before they become requests.',
          'When we take care of the details behind the scenes, our guests get to enjoy the moment in front of them.',
          "Excellence isn't usually one big thing.",
          "It's hundreds of small things done well.",
          "Because unforgettable experiences don't happen by accident.",
          "They're created on purpose.",
        ],
      },
    ],
  },
  {
    id: 'safety-matters',
    part: 'one',
    title: 'Safety Matters',
    nextLabel: 'Growing Together',
    photos: [
      {
        name: 'safety-matters',
        alt: 'The Twisted Pin team crowded together for a happy group selfie between shifts.',
      },
    ],
    sections: [
      {
        eyebrow: 'Twisted Pin Moment',
        title: 'Looking Out for Guests',
        blocks: [
          'A family had gathered for a photo.',
          'Someone stepped onto the bowling lane so they could capture everyone standing together.',
          "They didn't know.",
          'To them, it looked like another part of the floor.',
          'One of our teammates noticed immediately.',
          "Instead of calling out across the building or embarrassing the guest, they calmly walked over, helped them safely back onto the approach, and explained that bowling lanes are incredibly slippery—even though warning signs are posted, many guests don't realize just how dangerous they can be.",
          'The guest thanked them.',
          'The photo still happened.',
          'Everyone stayed safe.',
          "Sometimes the best hospitality isn't giving someone what they asked for.",
          "Sometimes it's protecting them from something they didn't know could hurt them.",
        ],
      },
      {
        eyebrow: 'Twisted Pin Moment',
        title: 'Looking Twice',
        blocks: [
          'It was a busy night behind the bar.',
          'A guest handed over an ID that looked completely legitimate.',
          'The bartender checked it.',
          'Then, before handing it back, something caught their attention.',
          'Instead of assuming it was fine, they took one more look.',
          'The ID turned out to be fake.',
          'A very convincing fake.',
          'Because one teammate trusted their instincts and paid attention to the details, they prevented an underage alcohol sale and protected our guests, our team, and our liquor license.',
          'Sometimes doing the right thing takes an extra thirty seconds.',
          'Those thirty seconds matter.',
        ],
      },
      {
        title: 'Safety Matters',
        blocks: [
          "Safety isn't just a policy.",
          "It's one of the ways we care for people.",
          'Every decision we make has the potential to protect someone.',
          'Sometimes that means preventing an accident before it happens.',
          "Sometimes it means speaking up when something doesn't seem right.",
          'Sometimes it means slowing down long enough to take a second look.',
          'Our guests trust us with more than a fun night out.',
          'They trust us with their families.',
          'Their celebrations.',
          'Their well-being.',
          'That trust is something we never take lightly.',
          "Whether you're wiping up a spill before someone slips...",
          'Checking an ID one more time...',
          'Reporting broken equipment...',
          "Or helping a guest who simply doesn't know what could be dangerous...",
          "You're protecting more than a policy.",
          "You're protecting people.",
          'Looking out for one another is part of being a great teammate.',
          'Looking out for our guests is part of being great hosts.',
          'Because the best memories are made when everyone gets home safely.',
          "Safety isn't about slowing the fun down.",
          "It's about making sure the fun can continue.",
          'Every shift.',
          'Every guest.',
          'Every teammate.',
          'Safety matters because people matter.',
        ],
      },
    ],
  },
  {
    id: 'growing-together',
    part: 'one',
    title: 'Growing Together',
    nextLabel: 'One Last Thing',
    photos: [
      {
        name: 'growing-together',
        alt: 'A group of young teammates on a team outing, lined up and giving thumbs up.',
      },
    ],
    sections: [
      {
        blocks: [
          'No one walks through our doors knowing everything.',
          "And we don't expect them to.",
          'Every teammate at Twisted Pin started somewhere.',
          'Someone answered their questions.',
          'Someone coached them through a mistake.',
          'Someone believed in them before they believed in themselves.',
          "Now it's our turn to do the same for someone else.",
          'Ask questions.',
          'Stay curious.',
          'Accept feedback.',
          'Offer help.',
          "Share what you've learned.",
          "Because the goal isn't perfection.",
          "It's progress.",
          "And if you're ever unsure...",
          'Ask.',
          "We'll figure it out together.",
        ],
      },
    ],
  },
  {
    id: 'one-last-thing',
    part: 'one',
    title: 'One Last Thing...',
    nextLabel: 'Sign the Playbook',
    photos: [
      {
        name: 'one-last-thing',
        alt: 'Four teammates with their arms around each other, smiling together at the bar.',
      },
    ],
    sections: [
      {
        blocks: [
          'Thank you for choosing to be part of Twisted Pin.',
          "Whether you're here for a season or for many years, we hope your time with us is filled with growth, laughter, friendships, and moments you'll always remember.",
          "The experiences we create don't happen because of our building...",
          'Or our bowling lanes.',
          'Or our food.',
          'They happen because of people.',
          'People who choose to notice.',
          'People who choose kindness.',
          'People who support one another.',
          'People who care.',
          'People like you.',
          "Every day, guests trust us with some of life's biggest moments...",
          'Birthdays.',
          'First dates.',
          'Reunions.',
          'Championships.',
          'Baby showers.',
          'Proposals.',
          'Family nights.',
          'Celebrations big and small.',
          'They may not remember every game they bowled.',
          'Or every meal they shared.',
          "But they'll always remember how we made them feel.",
          'Every lane has a story.',
          'Thank you for becoming part of ours.',
          "Now go be part of someone else's.",
        ],
      },
    ],
  },

  // NOTE: Part Two (The Guidebook) is NOT in this array. It lives in
  // `./guidebook.ts` and is reached from the hub as a separate, unsigned
  // reference book. An interim "How to Use This Guidebook" chapter briefly sat
  // at the end of this flow (2026-07-20) and was removed when the two-book hub
  // shipped — Jon's own "Welcome to the Guidebook" opens Part Two now, and the
  // Playbook must end on "One Last Thing..." → signature so the last thing a
  // teammate reads before signing is the closing, not a table of contents.
];

/** Front matter + Part One, in reading order. */
export const CHAPTER_IDS = CHAPTERS.map((c) => c.id);

export function chapterIndex(id: string): number {
  return CHAPTERS.findIndex((c) => c.id === id);
}
