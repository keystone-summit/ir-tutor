// WRITE 1001 — Foundations of Academic Writing
// Bachelor's-equivalent intro composition course.
// Arc: absolute mechanics (Week 1) -> advanced academic & argumentative writing (Week 14).
// Tense system is the backbone of Weeks 4-7, framed around describing past events
// and planning future events.
//
// Merged into the IR Tutor app as a route. Converted from the original
// TypeScript to plain JS to match this codebase's toolchain (no tsconfig).
// Exercise shape:
//   type: "fill" | "completion" | "paragraph" | "rewrite"
//   prompt: instruction shown to the student
//   text?:  the sentence/stem (with ___ blanks for "fill")
//   answers?: per-blank arrays of accepted answers (lowercased on compare)
//   targetTense?: for "rewrite"
//   minWords?: for "paragraph"

export const COURSE = {
  code: "WRITE 1001",
  title: "Foundations of Academic Writing",
  subtitle: "From Sentence Mechanics to Argumentative Mastery",
  credits: 3,
  description:
    "A bachelor's-equivalent introduction to written English. Students begin with the smallest building blocks — capitalization, punctuation, and word order — and progress through the full tense system, paragraph construction, the short essay, and finally advanced academic and argumentative prose. Every unit is repetitive by design: each concept is drilled with fill-in-the-blank, completion, short-paragraph, and tense-rewrite exercises, with an AI writing tutor that gives clear, direct feedback to keep learners moving.",
  outcomes: [
    "Apply the mechanics of standard written English (capitalization, punctuation, word order, parts of speech) automatically and accurately.",
    "Control all major English tenses to describe past events and plan future events with precision.",
    "Build unified, coherent paragraphs with strong topic sentences, evidence, and transitions.",
    "Compose a thesis-driven short essay with logically ordered supporting paragraphs.",
    "Produce advanced academic and argumentative writing with controlled rhetorical style and sophisticated tense management.",
  ],
};

export const WEEKS = [
  // ---------------- UNIT 1: MECHANICS (Weeks 1-3) ----------------
  {
    week: 1,
    unit: "Unit 1 · Mechanics",
    title: "Capitalization, Punctuation & Word Order",
    objective:
      "Write a correctly capitalized, correctly punctuated sentence with standard English word order.",
    concepts: [
      "Capital letters: first word, the pronoun I, proper nouns",
      "End punctuation: period, question mark, exclamation point",
      "The comma in a simple list",
      "Standard order: Subject → Verb → Object",
    ],
    reading: "Mechanics Primer §1 (capitalization & end marks).",
    tutorFocus:
      "Keep corrections to ONE rule at a time. Name the rule, show the fix, give a tiny example. Never overwhelm a beginner with multiple errors at once.",
    exercises: [
      {
        type: "fill",
        prompt: "Add the missing capital letters and end punctuation.",
        text: "my friend ___ and i went to ___",
        answers: [["maria", "sara", "a name"], ["paris", "school", "a place"]],
      },
      {
        type: "completion",
        prompt: "Finish this sentence with correct word order (Subject–Verb–Object).",
        text: "The dog ___",
      },
      {
        type: "paragraph",
        prompt:
          "Write 2–3 sentences about something you did today. Focus only on capital letters and end punctuation.",
        minWords: 15,
      },
    ],
  },
  {
    week: 2,
    unit: "Unit 1 · Mechanics",
    title: "Parts of Speech I — Nouns, Verbs, Adjectives",
    objective:
      "Identify and use nouns, verbs, and adjectives correctly in a sentence.",
    concepts: [
      "Nouns name people, places, things, ideas",
      "Verbs show action or state of being",
      "Adjectives describe nouns",
      "Why every sentence needs at least a noun + verb",
    ],
    reading: "Mechanics Primer §2 (parts of speech).",
    tutorFocus:
      "Label the word type plainly ('that's a verb because it shows action'). Use the student's own sentence as the example whenever possible.",
    exercises: [
      {
        type: "fill",
        prompt: "Fill each blank with the part of speech named in brackets.",
        text: "The [adjective] ___ cat [verb] ___ on the [noun] ___.",
        answers: [["black", "happy", "big", "small"], ["sat", "slept", "jumped", "ran"], ["mat", "chair", "bed", "floor"]],
      },
      {
        type: "completion",
        prompt: "Add an adjective to make this richer: 'The house was ___.'",
        text: "The house was ___",
      },
      {
        type: "paragraph",
        prompt: "Describe your room in 3 sentences. Underline (or capitalize) each adjective you use.",
        minWords: 20,
      },
    ],
  },
  {
    week: 3,
    unit: "Unit 1 · Mechanics",
    title: "Parts of Speech II — Pronouns, Prepositions, Conjunctions",
    objective:
      "Connect ideas using pronouns, prepositions, and conjunctions without breaking sentence flow.",
    concepts: [
      "Pronouns replace nouns (he, she, it, they)",
      "Prepositions show relationship (in, on, under, before)",
      "Conjunctions join (and, but, because, so)",
      "Avoiding run-ons and fragments",
    ],
    reading: "Mechanics Primer §3 (connectors).",
    tutorFocus:
      "When a student writes a run-on or fragment, show the single comma or conjunction that fixes it. One fix, then move on.",
    exercises: [
      {
        type: "fill",
        prompt: "Choose the right connector.",
        text: "I was tired ___ I kept working. The keys are ___ the table.",
        answers: [["but", "yet"], ["on", "under", "near"]],
      },
      {
        type: "completion",
        prompt: "Join these into one sentence using 'because': 'I stayed home. It rained.'",
        text: "I stayed home because ___",
      },
      {
        type: "paragraph",
        prompt:
          "Write 3 connected sentences about your morning. Use at least one conjunction and one preposition.",
        minWords: 25,
      },
    ],
  },

  // ---------------- UNIT 2: THE TENSE SYSTEM (Weeks 4-7) ----------------
  {
    week: 4,
    unit: "Unit 2 · The Tense System",
    title: "Present Tense — Describing What Is",
    objective: "Use simple and present-continuous tenses to describe current facts and ongoing actions.",
    concepts: [
      "Simple present for facts/habits (I work)",
      "Present continuous for now (I am working)",
      "Subject–verb agreement (he works, they work)",
    ],
    reading: "Tense Workbook §1 (present).",
    tutorFocus:
      "Agreement errors are the #1 beginner mistake here. Point to the subject, then the verb ending. Direct, concrete.",
    exercises: [
      {
        type: "fill",
        prompt: "Put the verb in the correct present form.",
        text: "She ___ (work) every day. They ___ (play) right now.",
        answers: [["works"], ["are playing"]],
      },
      {
        type: "completion",
        prompt: "Finish in present continuous: 'Right now, I ___'",
        text: "Right now, I ___",
      },
      {
        type: "paragraph",
        prompt: "Describe what is happening around you at this moment. 3–4 sentences, all present tense.",
        minWords: 30,
      },
    ],
  },
  {
    week: 5,
    unit: "Unit 2 · The Tense System",
    title: "Past Tense — Describing Events That Happened",
    objective: "Narrate completed past events using simple past and past continuous.",
    concepts: [
      "Regular past (-ed) vs. irregular (went, saw, ate)",
      "Past continuous for background action (was walking)",
      "Sequencing events with time words (first, then, after)",
    ],
    reading: "Tense Workbook §2 (past).",
    tutorFocus:
      "Irregular verbs trip everyone up. If a student writes 'goed', just give the correct form ('went') and one similar example.",
    exercises: [
      {
        type: "fill",
        prompt: "Use the correct past tense.",
        text: "Yesterday I ___ (go) to the store and ___ (buy) bread.",
        answers: [["went"], ["bought"]],
      },
      {
        type: "completion",
        prompt: "Finish describing a past event: 'Last weekend, I ___'",
        text: "Last weekend, I ___",
      },
      {
        type: "paragraph",
        prompt:
          "Tell the story of something that happened to you recently. 4–5 sentences. Use time words to order events.",
        minWords: 40,
      },
    ],
  },
  {
    week: 6,
    unit: "Unit 2 · The Tense System",
    title: "Future Tense — Planning Events That Will Happen",
    objective: "Express plans, predictions, and intentions using will, going to, and present continuous for future.",
    concepts: [
      "'Will' for decisions/predictions",
      "'Going to' for plans and intentions",
      "Present continuous for fixed arrangements (I'm meeting her tomorrow)",
    ],
    reading: "Tense Workbook §3 (future).",
    tutorFocus:
      "Help students feel the difference between 'will' (spontaneous/predicted) and 'going to' (already planned). Give a one-line contrast.",
    exercises: [
      {
        type: "fill",
        prompt: "Choose 'will' or 'going to'.",
        text: "I think it ___ rain. I already packed; I ___ visit my aunt.",
        answers: [["will"], ["am going to", "going to"]],
      },
      {
        type: "completion",
        prompt: "State a plan: 'Next month, I am going to ___'",
        text: "Next month, I am going to ___",
      },
      {
        type: "paragraph",
        prompt: "Write a plan for your next free weekend. 4–5 sentences, all future forms.",
        minWords: 40,
      },
    ],
  },
  {
    week: 7,
    unit: "Unit 2 · The Tense System",
    title: "Perfect Tenses & Tense Control",
    objective: "Use present/past perfect to link time periods, and switch tenses cleanly within a paragraph.",
    concepts: [
      "Present perfect for past-with-present-relevance (I have finished)",
      "Past perfect for the earlier of two past events (had left)",
      "Maintaining consistent tense; switching only with purpose",
    ],
    reading: "Tense Workbook §4 (perfect tenses).",
    tutorFocus:
      "This is the hardest tense unit. Use a timeline in words ('this happened BEFORE that, so use had + verb'). Be direct and concrete.",
    exercises: [
      {
        type: "fill",
        prompt: "Use present perfect or past perfect.",
        text: "I ___ (already / eat) when she arrived. She ___ (live) here since 2019.",
        answers: [["had already eaten", "had eaten"], ["has lived"]],
      },
      {
        type: "rewrite",
        prompt: "Rewrite this past-tense story as a FUTURE plan.",
        text: "Last summer I traveled to the coast. I swam every morning and read three books. I felt rested.",
        targetTense: "future",
      },
      {
        type: "paragraph",
        prompt:
          "Write about an achievement using present perfect, then explain what you did before it using past perfect. 4–5 sentences.",
        minWords: 45,
      },
    ],
  },

  // ---------------- UNIT 3: SENTENCE TO PARAGRAPH (Weeks 8-10) ----------------
  {
    week: 8,
    unit: "Unit 3 · Building Paragraphs",
    title: "Sentence Variety & Combining",
    objective: "Combine short sentences into varied, fluent ones using clauses and modifiers.",
    concepts: [
      "Simple, compound, complex sentences",
      "Subordinate clauses (although, while, since)",
      "Avoiding choppy or overloaded sentences",
    ],
    reading: "Composition Reader Ch. 1.",
    tutorFocus:
      "Show the combined version next to the choppy original so the improvement is visible. One combination technique at a time.",
    exercises: [
      {
        type: "completion",
        prompt: "Combine using 'although': 'The test was hard. I passed.'",
        text: "Although ___",
      },
      {
        type: "rewrite",
        prompt: "Rewrite these three choppy sentences as one or two fluent ones.",
        text: "I woke up. It was raining. I took an umbrella.",
        targetTense: "any",
      },
      {
        type: "paragraph",
        prompt: "Write 4 sentences about a place you like. Vary sentence length and structure.",
        minWords: 45,
      },
    ],
  },
  {
    week: 9,
    unit: "Unit 3 · Building Paragraphs",
    title: "The Topic Sentence & Paragraph Unity",
    objective: "Write a paragraph with one clear topic sentence and supporting detail that stays on point.",
    concepts: [
      "Topic sentence = the paragraph's main claim",
      "Unity: every sentence supports the topic",
      "Cutting sentences that wander off-topic",
    ],
    reading: "Composition Reader Ch. 2.",
    tutorFocus:
      "If a paragraph drifts, point to the exact sentence that breaks unity and explain why in one line.",
    exercises: [
      {
        type: "completion",
        prompt: "Write a topic sentence for a paragraph about your favorite meal.",
        text: "My favorite meal is ___",
      },
      {
        type: "paragraph",
        prompt:
          "Write a unified paragraph (5–6 sentences) supporting this topic sentence: 'Mornings are the best part of my day.'",
        minWords: 60,
      },
    ],
  },
  {
    week: 10,
    unit: "Unit 3 · Building Paragraphs",
    title: "Transitions & Coherence",
    objective: "Connect sentences and ideas smoothly using transition words and logical order.",
    concepts: [
      "Transitions of time, addition, contrast, cause/effect",
      "Logical ordering of supporting points",
      "Old-to-new information flow",
    ],
    reading: "Composition Reader Ch. 3.",
    tutorFocus:
      "Suggest the single transition word that would smooth a rough jump between two sentences.",
    exercises: [
      {
        type: "fill",
        prompt: "Add a transition (however, therefore, for example, afterward).",
        text: "It was expensive. ___, the quality was worth it.",
        answers: [["however", "still"]],
      },
      {
        type: "paragraph",
        prompt:
          "Write a 6-sentence paragraph explaining how you learned a skill. Use at least three transition words.",
        minWords: 70,
      },
    ],
  },

  // ---------------- UNIT 4: THE SHORT ESSAY (Weeks 11-12) ----------------
  {
    week: 11,
    unit: "Unit 4 · The Short Essay",
    title: "Thesis & Essay Structure",
    objective: "Craft a clear thesis statement and outline a multi-paragraph essay around it.",
    concepts: [
      "Thesis = arguable, specific main claim",
      "Intro → body paragraphs → conclusion",
      "One main idea per body paragraph",
    ],
    reading: "Composition Reader Ch. 4.",
    tutorFocus:
      "Test the thesis: is it specific and arguable? If vague, give a sharpened version as a model.",
    exercises: [
      {
        type: "completion",
        prompt: "Turn this topic into an arguable thesis: 'Remote work.'",
        text: "Remote work ___",
      },
      {
        type: "paragraph",
        prompt:
          "Write an introduction paragraph (4–5 sentences) ending in a clear thesis on whether students should learn to code.",
        minWords: 70,
      },
    ],
  },
  {
    week: 12,
    unit: "Unit 4 · The Short Essay",
    title: "Evidence, Body Paragraphs & Conclusions",
    objective: "Support a thesis with evidence-based body paragraphs and write an effective conclusion.",
    concepts: [
      "Point–Evidence–Explanation structure",
      "Integrating examples and reasons",
      "Conclusions that synthesize, not just repeat",
    ],
    reading: "Composition Reader Ch. 5. MIDTERM ESSAY DUE.",
    tutorFocus:
      "Check that each body paragraph has evidence, not just opinion. Name the paragraph missing support.",
    exercises: [
      {
        type: "paragraph",
        prompt:
          "Write one body paragraph (6–7 sentences) using Point–Evidence–Explanation to support: 'Reading daily improves writing.'",
        minWords: 80,
      },
      {
        type: "paragraph",
        prompt: "Write a conclusion paragraph that synthesizes (does not just repeat) a 3-point essay on healthy habits.",
        minWords: 60,
      },
    ],
  },

  // ---------------- UNIT 5: ADVANCED WRITING (Weeks 13-14) ----------------
  {
    week: 13,
    unit: "Unit 5 · Advanced & Argumentative Writing",
    title: "Rhetoric, Style & Sophisticated Tense Control",
    objective:
      "Write persuasive prose with varied rhetorical moves and deliberate, complex tense shifts.",
    concepts: [
      "Ethos, pathos, logos in writing",
      "Parallelism, emphasis, sentence rhythm",
      "Mixing tenses purposefully (past evidence → present claim → future implication)",
    ],
    reading: "Advanced Composition Ch. 1–2.",
    tutorFocus:
      "Now push for elegance, not just correctness. Suggest a stronger verb, a tighter phrase, a more deliberate rhythm.",
    exercises: [
      {
        type: "rewrite",
        prompt:
          "Rewrite this flat sentence with stronger style and rhythm: 'The policy was bad and people did not like it and it failed.'",
        text: "The policy was bad and people did not like it and it failed.",
        targetTense: "any",
      },
      {
        type: "paragraph",
        prompt:
          "Write a persuasive paragraph (7–8 sentences) that uses past evidence, a present claim, and a future implication.",
        minWords: 90,
      },
    ],
  },
  {
    week: 14,
    unit: "Unit 5 · Advanced & Argumentative Writing",
    title: "The Argumentative Essay — Mastery",
    objective:
      "Produce a polished, thesis-driven argumentative essay with counterargument, evidence, and controlled style.",
    concepts: [
      "Acknowledging and rebutting counterarguments",
      "Sustaining one argument across multiple paragraphs",
      "Final polish: precision, concision, tone",
    ],
    reading: "Advanced Composition Ch. 3. FINAL ESSAY DUE.",
    tutorFocus:
      "Review at the whole-essay level: is the argument sustained, is the counterargument handled, is the prose clean? Give prioritized, direct fixes.",
    exercises: [
      {
        type: "paragraph",
        prompt:
          "Write a counterargument-and-rebuttal paragraph (7–8 sentences) for an essay arguing that public transit should be free.",
        minWords: 90,
      },
      {
        type: "paragraph",
        prompt:
          "FINAL: Write the opening two paragraphs (intro + first body) of an argumentative essay on a topic you choose. Aim for mastery-level clarity and style.",
        minWords: 150,
      },
    ],
  },
];
