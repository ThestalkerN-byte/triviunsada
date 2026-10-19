export type Career = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type AnswerOption = {
  id: string;
  text: string;
};

export type Question = {
  id: string;
  careerId: string;
  text: string;
  timeLimitSeconds: number;
  options: AnswerOption[];
  correctOptionId: string;
};

export type QuestionBank = {
  version: 1;
  careers: Career[];
  questions: Question[];
};

export type ExportedQuestionBank = QuestionBank & {
  exportedAt: string;
};
