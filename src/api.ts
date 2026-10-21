export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch("/api" + url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Workbench-Request": "1",
      ...init.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || `请求失败 (${response.status})`);
  return data;
}
export const post = <T>(url: string, body: unknown = {}) =>
  api<T>(url, { method: "POST", body: JSON.stringify(body) });
export const patch = <T>(url: string, body: unknown) =>
  api<T>(url, { method: "PATCH", body: JSON.stringify(body) });
