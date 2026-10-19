const CONFIG_USER = "unsada";
const CONFIG_PASSWORD = "123789Sada!";

export const CONFIG_ACCESS_KEY = "triviunsada.config-access";

export function credentialsMatch(user: string, password: string): boolean {
  return user === CONFIG_USER && password === CONFIG_PASSWORD;
}
