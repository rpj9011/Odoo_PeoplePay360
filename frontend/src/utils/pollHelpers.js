export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

export function getPollQuestions(poll) {
  if (!poll) return [];
  if (Array.isArray(poll.questions) && poll.questions.length > 0) {
    return poll.questions;
  }
  if (poll.question) {
    return [
      {
        text: poll.question,
        type: "multiple_choice",
        options: poll.options || [],
        allowMultiple: Boolean(poll.allowMultiple),
      },
    ];
  }
  return [];
}

export function isMultiQuestionPoll(poll) {
  return Array.isArray(poll?.questions) && poll.questions.length > 0;
}

export function getPollTitle(msg) {
  if (!msg?.poll) return msg?.message || "";
  if (msg.poll.title) return msg.poll.title;
  const questions = getPollQuestions(msg.poll);
  if (questions.length === 1) return questions[0].text;
  if (questions.length > 1) return msg.poll.title || msg.message || `Survey (${questions.length} questions)`;
  return msg.message || "";
}

export function hasSubmitted(msg) {
  if (Array.isArray(msg.userAnswers) && msg.userAnswers.length > 0) return true;
  if (Array.isArray(msg.userVote) && msg.userVote.length > 0) return true;
  return false;
}

export function isPollExpired(poll) {
  if (!poll?.closesAt) return false;
  return new Date() > new Date(poll.closesAt);
}

export function createEmptyQuestion(type = "multiple_choice") {
  return {
    text: "",
    type,
    options: type === "multiple_choice" ? ["", ""] : [],
    allowMultiple: false,
  };
}

export function formatAnswerSummary(answers, questions) {
  if (!answers?.length) return "";
  return answers
    .map((a) => {
      const q = questions[a.questionIndex];
      if (!q) return "";
      if (a.text) return `"${a.text.slice(0, 60)}${a.text.length > 60 ? "…" : ""}"`;
      const opts = (a.optionIndices || [])
        .map((i) => q.options?.[i]?.text || `Option ${i + 1}`)
        .join(", ");
      return opts;
    })
    .filter(Boolean)
    .join(" · ");
}
