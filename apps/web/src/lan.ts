import { Capacitor, registerPlugin } from '@capacitor/core';
type Connection = { configured: boolean; server: string };
interface LanApiPlugin {
  connection(): Promise<Connection>;
  configure(options: { pairing: string }): Promise<Connection>;
  forget(): Promise<void>;
  request(options: {
    path: string;
    method: string;
    body: string;
    timeout: number;
  }): Promise<{ status: number; data: unknown }>;
}
const LanApi = registerPlugin<LanApiPlugin>('LanApi');
export const isAndroid = () => Capacitor.getPlatform() === 'android';
export const getConnection = () => LanApi.connection();
export const configureConnection = (pairing: string) => LanApi.configure({ pairing });
export const forgetConnection = () => LanApi.forget();
export async function transport(
  path: string,
  init?: RequestInit,
  timeout = 8000,
): Promise<{ status: number; data: any }> {
  if (isAndroid()) {
    try {
      return await LanApi.request({
        path,
        method: init?.method || 'GET',
        body: String(init?.body || ''),
        timeout,
      });
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : '无法连接电脑，请在设置里核对连接配置。',
      );
    }
  }
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(timeout),
  });
  return { status: response.status, data: await response.json() };
}
