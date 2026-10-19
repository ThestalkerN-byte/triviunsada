import { describe, expect, it } from "vitest";
import { scoreCompetitiveAnswer } from "./scoring";

describe("scoreCompetitiveAnswer", () => {
  it("otorga 1000 cuando la respuesta correcta usa todo el tiempo", () => {
    expect(
      scoreCompetitiveAnswer({
        isCorrect: true,
        secondsRemaining: 20,
        timeLimitSeconds: 20,
      }),
    ).toBe(1000);
  });

  it("otorga 500 cuando la respuesta correcta llega justo al cierre", () => {
    expect(
      scoreCompetitiveAnswer({
        isCorrect: true,
        secondsRemaining: 0,
        timeLimitSeconds: 20,
      }),
    ).toBe(500);
  });

  it("otorga 0 cuando la respuesta es incorrecta", () => {
    expect(
      scoreCompetitiveAnswer({
        isCorrect: false,
        secondsRemaining: 20,
        timeLimitSeconds: 20,
      }),
    ).toBe(0);
  });

  it("otorga 0 cuando la respuesta correcta llega fuera de tiempo", () => {
    expect(
      scoreCompetitiveAnswer({
        isCorrect: true,
        secondsRemaining: -1,
        timeLimitSeconds: 20,
      }),
    ).toBe(0);
  });
});
