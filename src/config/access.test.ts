import { describe, expect, it } from "vitest";
import { credentialsMatch } from "./access";

describe("acceso a configuración", () => {
  it("acepta el usuario y la contraseña previstos", () => {
    expect(credentialsMatch("unsada", "123789Sada!")).toBe(true);
  });

  it("rechaza un usuario, una contraseña o un espacio de más", () => {
    expect(credentialsMatch("Unsada", "123789Sada!")).toBe(false);
    expect(credentialsMatch("unsada", "123789Sada")).toBe(false);
    expect(credentialsMatch(" unsada", "123789Sada!")).toBe(false);
    expect(credentialsMatch("unsada", "123789Sada! ")).toBe(false);
  });
});
