// ROOTS 1001 — Greek & Latin Roots
// A 14-week vocabulary course: ~70 high-yield roots (5 per week), each with a
// plain-language meaning and 3–5 example words. Designed from scratch to match
// the WRITE 1001 pattern (units → weeks → per-week content + auto-checked
// drills + AI tutor). Drills (match / fill / build / identify) are GENERATED
// from each week's roots at render time (see page.jsx), so this file only
// holds the root data + per-week teaching focus.
//
// Root shape: { root, meaning, examples: [..] }

export const COURSE = {
  code: "ROOTS 1001",
  title: "Greek & Latin Roots",
  subtitle: "The Building Blocks of English Vocabulary",
  credits: 3,
  description:
    "Most academic English is built from a small set of Greek and Latin roots, prefixes, and suffixes. Learn ~70 of the highest-yield ones and you can decode thousands of unfamiliar words on sight. This course moves from Greek prefixes to Latin prefixes, then the great Latin action and state stems, and finally the suffixes that turn roots into finished words. Each week drills five roots with matching, fill-in-the-blank, build-a-word, and identify-the-root exercises, plus an AI etymology tutor that breaks any word down to its parts.",
  outcomes: [
    "Recognize ~70 core Greek and Latin roots, prefixes, and suffixes by sight.",
    "Decode the meaning of unfamiliar words by breaking them into known parts.",
    "Build correct English words from a given root and meaning.",
    "Explain the literal origin of common academic vocabulary.",
  ],
};

export const WEEKS = [
  // ---------------- UNIT 1: GREEK PREFIXES (Weeks 1-3) ----------------
  {
    week: 1,
    unit: "Unit 1 · Greek Prefixes",
    title: "Greek Prefixes I — a/an, anti, auto, bio, chrono",
    objective: "Recognize five foundational Greek prefixes and decode words built from them.",
    note: "Greek prefixes attach to the FRONT of a word and change its meaning.",
    tutorFocus:
      "Break each word into prefix + stem, give the literal meaning, then a modern example. Greek origin. Direct answers, one tiny example.",
    roots: [
      { root: "a-/an-", meaning: "not, without", examples: ["atypical", "anonymous", "apathy", "atheist"] },
      { root: "anti-", meaning: "against, opposite", examples: ["antibody", "antisocial", "antidote", "antithesis"] },
      { root: "auto-", meaning: "self", examples: ["automatic", "autograph", "autobiography", "autonomy"] },
      { root: "bio-", meaning: "life", examples: ["biology", "biography", "antibiotic", "biosphere"] },
      { root: "chrono-", meaning: "time", examples: ["chronological", "chronicle", "synchronize", "anachronism"] },
    ],
  },
  {
    week: 2,
    unit: "Unit 1 · Greek Prefixes",
    title: "Greek Prefixes II — dia, eco, geo, hetero, homo",
    objective: "Decode words about direction, environment, earth, and sameness/difference.",
    note: "Notice how hetero- (different) and homo- (same) are opposites.",
    tutorFocus:
      "Contrast hetero-/homo- explicitly. Always give the literal split and one example. Greek origin.",
    roots: [
      { root: "dia-", meaning: "across, through", examples: ["diameter", "dialogue", "diagonal", "diagnosis"] },
      { root: "eco-", meaning: "house, environment", examples: ["ecology", "economy", "ecosystem", "ecofriendly"] },
      { root: "geo-", meaning: "earth", examples: ["geography", "geology", "geometry", "geopolitics"] },
      { root: "hetero-", meaning: "different, other", examples: ["heterogeneous", "heterodox", "heteronym"] },
      { root: "homo-", meaning: "same", examples: ["homogeneous", "homonym", "homophone", "homogenize"] },
    ],
  },
  {
    week: 3,
    unit: "Unit 1 · Greek Prefixes",
    title: "Greek Prefixes III — mega, micro, mono, neo, neuro",
    objective: "Decode words about size, singleness, newness, and the nervous system.",
    note: "mega- (large) and micro- (small) are a useful size pair.",
    tutorFocus:
      "Pair mega-/micro- by size. Give the literal meaning and a familiar example. Greek origin.",
    roots: [
      { root: "mega-", meaning: "great, large, million", examples: ["megaphone", "megabyte", "megalopolis", "megastar"] },
      { root: "micro-", meaning: "small", examples: ["microscope", "microbe", "microphone", "microcosm"] },
      { root: "mono-", meaning: "one, single", examples: ["monologue", "monopoly", "monotone", "monarch"] },
      { root: "neo-", meaning: "new", examples: ["neonatal", "neologism", "neoclassical", "neophyte"] },
      { root: "neuro-", meaning: "nerve", examples: ["neurology", "neuron", "neurotic", "neuroscience"] },
    ],
  },

  // ---------------- UNIT 2: LATIN PREFIXES (Weeks 4-6) ----------------
  {
    week: 4,
    unit: "Unit 2 · Latin Prefixes",
    title: "Latin Prefixes I — ad, ante, bene, bi, circum",
    objective: "Decode words about direction, time order, goodness, two-ness, and surrounding.",
    note: "ante- means 'before' — don't confuse it with anti- ('against').",
    tutorFocus:
      "Warn about ante- vs anti-. Give literal split + example. Latin origin.",
    roots: [
      { root: "ad-", meaning: "to, toward", examples: ["advance", "adhere", "adapt", "adjacent"] },
      { root: "ante-", meaning: "before", examples: ["antecedent", "anterior", "antedate", "antebellum"] },
      { root: "bene-", meaning: "good, well", examples: ["benefit", "benevolent", "benefactor", "benign"] },
      { root: "bi-", meaning: "two", examples: ["bicycle", "bilingual", "bisect", "biannual"] },
      { root: "circum-", meaning: "around", examples: ["circumference", "circumnavigate", "circumstance", "circumspect"] },
    ],
  },
  {
    week: 5,
    unit: "Unit 2 · Latin Prefixes",
    title: "Latin Prefixes II — contra, de, dis, ex, in/im",
    objective: "Decode words of opposition, removal, negation, and direction out or in.",
    note: "in-/im- can mean BOTH 'not' (invisible) and 'into' (inject) — context decides.",
    tutorFocus:
      "Explain the two senses of in-/im-. Literal split + example. Latin origin.",
    roots: [
      { root: "contra-", meaning: "against", examples: ["contradict", "contrast", "contrary", "contraband"] },
      { root: "de-", meaning: "down, away, reverse", examples: ["descend", "deduct", "devalue", "derail"] },
      { root: "dis-", meaning: "apart, not", examples: ["disagree", "disconnect", "distract", "disrupt"] },
      { root: "ex-", meaning: "out, from", examples: ["exit", "export", "extract", "exhale"] },
      { root: "in-/im-", meaning: "not; into", examples: ["invisible", "impossible", "import", "inject"] },
    ],
  },
  {
    week: 6,
    unit: "Unit 2 · Latin Prefixes",
    title: "Latin Prefixes III — inter, intra, post, pre, sub",
    objective: "Decode words about between/within, before/after, and below.",
    note: "inter- (between) vs intra- (within): international vs intramural.",
    tutorFocus:
      "Contrast inter-/intra- and pre-/post-. Literal split + example. Latin origin.",
    roots: [
      { root: "inter-", meaning: "between, among", examples: ["international", "interrupt", "intersect", "interact"] },
      { root: "intra-", meaning: "within", examples: ["intramural", "intravenous", "intranet", "intrastate"] },
      { root: "post-", meaning: "after", examples: ["postpone", "postscript", "postwar", "posterior"] },
      { root: "pre-", meaning: "before", examples: ["preview", "predict", "prevent", "prefix"] },
      { root: "sub-", meaning: "under, below", examples: ["submarine", "subway", "substandard", "submerge"] },
    ],
  },

  // ---------------- UNIT 3: ACTION STEMS (Weeks 7-9) ----------------
  {
    week: 7,
    unit: "Unit 3 · Action Stems",
    title: "Action Stems I — act, dict, fac/fic, leg, mit/miss",
    objective: "Decode words built on the great Latin verbs of doing, saying, making, and sending.",
    note: "These stems sit in the MIDDLE of words, with prefixes and suffixes attached.",
    tutorFocus:
      "Find the stem inside the word, give its verb meaning, then the whole word's meaning. Latin origin.",
    roots: [
      { root: "act", meaning: "to do, drive", examples: ["action", "react", "activate", "transact"] },
      { root: "dict", meaning: "to say, speak", examples: ["dictate", "predict", "contradict", "verdict"] },
      { root: "fac/fic", meaning: "to make, do", examples: ["factory", "manufacture", "fiction", "efficient"] },
      { root: "leg", meaning: "to read, choose, law", examples: ["legible", "legend", "legal", "delegate"] },
      { root: "mit/miss", meaning: "to send", examples: ["transmit", "submit", "mission", "dismiss"] },
    ],
  },
  {
    week: 8,
    unit: "Unit 3 · Action Stems",
    title: "Action Stems II — port, scrib/script, spec, tract, vid/vis",
    objective: "Decode words about carrying, writing, looking, pulling, and seeing.",
    note: "spec/spect (look) and vid/vis (see) overlap — both are about sight.",
    tutorFocus:
      "Distinguish spec- (look) from vid/vis (see) when asked. Literal split + example. Latin origin.",
    roots: [
      { root: "port", meaning: "to carry", examples: ["transport", "portable", "export", "import"] },
      { root: "scrib/script", meaning: "to write", examples: ["describe", "manuscript", "prescription", "scribble"] },
      { root: "spec/spect", meaning: "to look, see", examples: ["inspect", "spectator", "perspective", "suspect"] },
      { root: "tract", meaning: "to pull, drag", examples: ["tractor", "attract", "extract", "contract"] },
      { root: "vid/vis", meaning: "to see", examples: ["video", "visible", "vision", "evident"] },
    ],
  },
  {
    week: 9,
    unit: "Unit 3 · Action Stems",
    title: "Action Stems III — vert/vers, voc, ven/vent, cred, log",
    objective: "Decode words about turning, calling, coming, believing, and reasoning.",
    note: "log means 'word/reason' — it powers both -logy (study) and dialogue.",
    tutorFocus:
      "Connect log here to the -logy suffix coming in Unit 5. Literal split + example.",
    roots: [
      { root: "vert/vers", meaning: "to turn", examples: ["convert", "reverse", "divert", "versatile"] },
      { root: "voc", meaning: "to call, voice", examples: ["vocal", "advocate", "vocation", "evoke"] },
      { root: "ven/vent", meaning: "to come", examples: ["convene", "prevent", "invent", "venue"] },
      { root: "cred", meaning: "to believe, trust", examples: ["credit", "incredible", "credible", "credentials"] },
      { root: "log", meaning: "word, reason, speech", examples: ["logic", "dialogue", "prologue", "apology"] },
    ],
  },

  // ---------------- UNIT 4: STATE STEMS (Weeks 10-11) ----------------
  {
    week: 10,
    unit: "Unit 4 · State Stems",
    title: "State Stems I — vit/viv, mor/mort, ped/pod, fid, fer",
    objective: "Decode words about life, death, feet, faith, and carrying/bearing.",
    note: "vit/viv (life) and mor/mort (death) are a natural opposite pair.",
    tutorFocus:
      "Pair life/death stems. Note ped/pod can be Latin OR Greek for 'foot'. Literal split + example.",
    roots: [
      { root: "vit/viv", meaning: "life, to live", examples: ["vital", "vivid", "survive", "revive"] },
      { root: "mor/mort", meaning: "death", examples: ["mortal", "mortuary", "immortal", "mortician"] },
      { root: "ped/pod", meaning: "foot", examples: ["pedal", "pedestrian", "podiatrist", "tripod"] },
      { root: "fid", meaning: "faith, trust", examples: ["fidelity", "confide", "infidel", "confident"] },
      { root: "fer", meaning: "to carry, bear", examples: ["transfer", "refer", "ferry", "conifer"] },
    ],
  },
  {
    week: 11,
    unit: "Unit 4 · State Stems",
    title: "State Stems II — cap, corp, gen, jud, magn",
    objective: "Decode words about taking/holding, the body, birth/kind, judging, and greatness.",
    note: "gen is everywhere: it means birth, kind, or origin.",
    tutorFocus:
      "Show how one stem (e.g. gen) appears in many words. Literal split + example. Latin origin.",
    roots: [
      { root: "cap/capt", meaning: "to take, hold, head", examples: ["capture", "capable", "captive", "caption"] },
      { root: "corp", meaning: "body", examples: ["corporation", "corpse", "corps", "incorporate"] },
      { root: "gen", meaning: "birth, kind, origin", examples: ["generate", "genetic", "genre", "generation"] },
      { root: "jud", meaning: "to judge, law", examples: ["judge", "judicial", "prejudice", "judgment"] },
      { root: "magn", meaning: "great, large", examples: ["magnify", "magnificent", "magnitude", "magnate"] },
    ],
  },

  // ---------------- UNIT 5: SUFFIXES (Weeks 12-14) ----------------
  {
    week: 12,
    unit: "Unit 5 · Suffixes",
    title: "Suffixes I — -logy, -graph, -meter, -phone, -scope",
    objective: "Recognize Greek suffixes that name fields, instruments, and recordings.",
    note: "Suffixes attach to the END of a word and often tell you 'what kind of thing' it is.",
    tutorFocus:
      "Explain what the suffix turns the word INTO (a study, an instrument, a recording). Greek origin. Example.",
    roots: [
      { root: "-logy", meaning: "study of", examples: ["biology", "geology", "psychology", "theology"] },
      { root: "-graph", meaning: "written, drawn, recorded", examples: ["autograph", "photograph", "paragraph", "telegraph"] },
      { root: "-meter", meaning: "measure", examples: ["thermometer", "diameter", "perimeter", "barometer"] },
      { root: "-phone", meaning: "sound, voice", examples: ["telephone", "microphone", "symphony", "homophone"] },
      { root: "-scope", meaning: "instrument for viewing", examples: ["microscope", "telescope", "periscope", "stethoscope"] },
    ],
  },
  {
    week: 13,
    unit: "Unit 5 · Suffixes",
    title: "Suffixes II — -ist, -ism, -ity, -ation, -ize",
    objective: "Recognize suffixes that name people, beliefs, states, processes, and actions.",
    note: "-ist = a person; -ism = a belief or condition. Same root, different ending.",
    tutorFocus:
      "Contrast -ist (person) and -ism (belief). Show how -ize makes a verb. Example each.",
    roots: [
      { root: "-ist", meaning: "one who does or believes", examples: ["artist", "scientist", "tourist", "optimist"] },
      { root: "-ism", meaning: "belief, doctrine, condition", examples: ["capitalism", "heroism", "criticism", "optimism"] },
      { root: "-ity", meaning: "state or quality of", examples: ["reality", "equality", "activity", "curiosity"] },
      { root: "-ation", meaning: "act, process, or result of", examples: ["creation", "education", "information", "celebration"] },
      { root: "-ize", meaning: "to make or become", examples: ["organize", "realize", "modernize", "criticize"] },
    ],
  },
  {
    week: 14,
    unit: "Unit 5 · Suffixes",
    title: "Suffixes III — -ology, -archy, -cracy, -phobia, -mania",
    objective: "Recognize suffixes for sciences, forms of rule, fears, and obsessions.",
    note: "-archy and -cracy both mean rule/government — monarchy vs democracy.",
    tutorFocus:
      "Contrast -archy/-cracy forms of rule. Note -phobia (fear) vs -mania (obsession). Greek origin. Example.",
    roots: [
      { root: "-ology", meaning: "study or science of", examples: ["sociology", "technology", "mythology", "zoology"] },
      { root: "-archy", meaning: "rule, government", examples: ["monarchy", "anarchy", "oligarchy", "hierarchy"] },
      { root: "-cracy", meaning: "rule, power, government", examples: ["democracy", "autocracy", "bureaucracy", "aristocracy"] },
      { root: "-phobia", meaning: "fear of", examples: ["claustrophobia", "arachnophobia", "hydrophobia", "xenophobia"] },
      { root: "-mania", meaning: "excessive desire, madness", examples: ["kleptomania", "pyromania", "megalomania", "maniac"] },
    ],
  },
];
