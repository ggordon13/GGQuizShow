const q = (text, answers, correctIndex, timeLimit = 20, points = 1) => ({
  text,
  timeLimit,
  points,
  answers: answers.map((a, i) => ({ text: a, correct: i === correctIndex })),
});

/** Seeded into the quiz library the first time the app is opened. */
export const SAMPLE_QUIZZES = [
  {
    title: 'General Knowledge Warm-up',
    questions: [
      q('What is the largest planet in our solar system?', ['Saturn', 'Jupiter', 'Neptune', 'Earth'], 1),
      q('How many sides does a hexagon have?', ['5', '8', '6', '7'], 2, 10),
      q('Which language runs natively in web browsers?', ['Python', 'C#', 'Java', 'JavaScript'], 3),
      q('The Great Wall of China is visible from the Moon with the naked eye.', ['True', 'False'], 1, 10),
      q('What is the chemical symbol for gold?', ['Au', 'Ag', 'Gd', 'Go'], 0),
      q('Which ocean is the largest?', ['Atlantic', 'Indian', 'Pacific', 'Arctic'], 2, 20, 2),
    ],
  },
];
