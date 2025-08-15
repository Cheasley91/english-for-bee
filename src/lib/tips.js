export const TIPS = [
  "Speak slowly and clearly; confidence beats speed.",
  "Review yesterday’s words before adding new ones.",
  "Build short sentences: subject + verb + object.",
  "Shadow native audio for rhythm and stress.",
  "Use new words in a message to a friend.",
  "Pair words with images; memory loves pictures.",
  "Rehearse real-life dialogs: market, taxi, cafe.",
  "Repeat mistakes out loud—then correct them.",
  "Small, daily practice beats weekend marathons.",
  "Mix listening and speaking; don’t just read.",
  "Learn collocations: 'make a decision', not 'do'.",
  "Use spaced review: 1d, 3d, 7d, 14d…",
  "Keep sentences simple; clarity first.",
  "Group vocab by topic: food, travel, work.",
  "Record yourself and compare to native audio.",
  "Translate to Thai only to check understanding.",
  "Use phrasal verbs sparingly at first.",
  "Ask 'Can you say that again, more slowly?'",
  "Celebrate small wins; motivation fuels progress.",
  "Set a 10-minute timer; start now.",
  "Label items at home in English.",
  "Listen twice; speak once.",
  "Pronounce final consonants; don’t drop them.",
  "Write one micro-story using today’s words.",
  "Practice questions: who/what/where/when/why/how.",
  "Use 'I' statements to practice fluency.",
  "Keep a pocket list of tricky words.",
  "Alternate topics to avoid boredom.",
  "Teach someone else one word today.",
  "End every session with a quick review.",
];

export function tipOfTheDay(date = new Date()) {
  const idx = (date.getDate() - 1) % TIPS.length;
  return TIPS[idx];
}

