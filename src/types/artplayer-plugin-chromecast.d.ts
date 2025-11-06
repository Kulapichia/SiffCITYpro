// 定义一个基础的 Artplayer 实例接口，以替代 any 类型。
// 这样做可以提供更好的类型提示和安全保障。
interface ArtplayerInstance {
  // 这里可以根据实际使用的 Artplayer API 添加具体的属性和方法定义
  [key: string]: unknown;
}

declare module '@/lib/artplayer-plugin-chromecast' {
  interface ChromecastPluginOptions {
    icon?: string;
    sdk?: string;
    url?: string;
    mimeType?: string;
    onStateChange?: (state: 'connected' | 'connecting' | 'disconnected' | 'disconnecting') => void;
    onCastAvailable?: (available: boolean) => void;
    onCastStart?: () => void;
    onError?: (error: Error) => void;
  }

  interface ChromecastPlugin {
    name: 'artplayerPluginChromecast';
    // 使用 `unknown` 替代 `any`，因为返回值类型不确定，`unknown` 是更安全的选择。
    getCastState: () => unknown;
    isCasting: () => boolean;
  }

  // 使用我们定义的 ArtplayerInstance 接口来明确 art 参数的类型。
  function artplayerPluginChromecast(options?: ChromecastPluginOptions): (art: ArtplayerInstance) => Promise<ChromecastPlugin>;
  export default artplayerPluginChromecast;
}
