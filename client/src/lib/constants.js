/** The four answer slots: each has a colour and a shape so colour-blind players can tell them apart. */
export const ANSWER_STYLES = [
  { key: 'red', color: '#ff4d6d', shape: 'triangle', label: 'Triangle' },
  { key: 'blue', color: '#4d7cff', shape: 'diamond', label: 'Diamond' },
  { key: 'gold', color: '#ffb627', shape: 'circle', label: 'Circle' },
  { key: 'green', color: '#2ec27e', shape: 'square', label: 'Square' },
];

export const TIME_LIMITS = [5, 10, 20, 30, 45, 60, 90, 120];

export const POINT_OPTIONS = [
  { value: 1, label: 'Standard' },
  { value: 2, label: 'Double points' },
  { value: 0, label: 'No points' },
];

export const LIMITS = { title: 120, questionText: 300, answerText: 100, questions: 100, nickname: 20 };
