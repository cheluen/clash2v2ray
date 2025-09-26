'use client';

import React, { useState, ChangeEvent } from 'react';
import yaml from 'js-yaml';

interface Proxy {
  name: string;
  type: string; // ss, vmess, vless, hy2, tuic, ssr
  server: string;
  port: number;
  password?: string; // ss, hy2, tuic, ssr
  uuid?: string; // vmess, vless
  alterId?: number; // vmess
  cipher?: string; // ss, ssr
  network?: string; // vmess, vless
  tls?: boolean;
  sni?: string;
  protocol?: string; // ssr
  obfs?: string; // ssr
}

export default function Home() {
  const [input, setInput] = useState('');
  const [direction, setDirection] = useState<'clash-to-v2ray' | 'v2ray-to-clash'>('clash-to-v2ray');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchContent = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Fetch failed');
      return await response.text();
    } catch (err) {
      throw new Error('远程链接获取失败（浏览器CORS限制），请直接粘贴 YAML 或 base64 内容');
    }
  };

  const clashToV2ray = async (inputContent: string): Promise<string> => {
    let content = inputContent.trim();
    if (content.startsWith('http')) {
      content = await fetchContent(content);
    }

    let clashConfig;
    try {
      clashConfig = yaml.load(content) as any;
    } catch (e) {
      throw new Error('无效的Clash YAML格式');
    }

    const proxies = clashConfig.proxies || [];
    const v2rayNodes: string[] = [];

    for (const proxy of proxies) {
      let nodeUri = '';
      const encodedName = encodeURIComponent(proxy.name || 'Unnamed');

      if (proxy.type === 'ss' || proxy.type === 'ssr') {
        const methodPassword = `${proxy.cipher || 'aes-128-gcm'}:${proxy.password || ''}`;
        const base64Auth = btoa(unescape(encodeURIComponent(methodPassword)));
        nodeUri = `ss://${base64Auth}@${proxy.server}:${proxy.port}#${encodedName}`;
      } else if (proxy.type === 'vmess') {
        const vmessConfig = {
          v: '2',
          ps: proxy.name,
          add: proxy.server,
          port: proxy.port,
          id: proxy.uuid || '',
          aid: proxy.alterId || 0,
          net: proxy.network || 'tcp',
          type: 'none',
          host: '',
          path: '',
          tls: proxy.tls ? 'tls' : '',
          sni: proxy.sni || '',
        };
        const vmessStr = JSON.stringify(vmessConfig);
        const base64 = btoa(unescape(encodeURIComponent(vmessStr)));
        nodeUri = `vmess://${base64}`;
      } else if (proxy.type === 'vless') {
        let vlessParams = `encryption=none&security=tls&sni=${encodeURIComponent(proxy.sni || '')}`;
        nodeUri = `vless://${encodeURIComponent(proxy.uuid || '')}@${proxy.server}:${proxy.port}?${vlessParams}#${encodedName}`;
      } else if (proxy.type === 'hy2' || proxy.type === 'hysteria2') {
        nodeUri = `hysteria2://${encodeURIComponent(proxy.password || '')}@${proxy.server}:${proxy.port}?sni=${encodeURIComponent(proxy.sni || '')}#${encodedName}`;
      } else if (proxy.type === 'tuic') {
        nodeUri = `tuic://${encodeURIComponent(proxy.password || '')}@${proxy.server}:${proxy.port}?security=tls&sni=${encodeURIComponent(proxy.sni || '')}#${encodedName}`;
      }

      if (nodeUri) v2rayNodes.push(nodeUri);
    }

    if (v2rayNodes.length === 0) throw new Error('未找到有效节点');
    const uriList = v2rayNodes.join('\n');
    return btoa(unescape(encodeURIComponent(uriList)));
  };

  const v2rayToClash = async (inputContent: string): Promise<string> => {
    let content = inputContent.trim();
    if (content.startsWith('http')) {
      const fetched = await fetchContent(content);
      content = fetched.trim();
    }

    let uriList;
    try {
      uriList = atob(content);
    } catch (e) {
      throw new Error('无效的V2ray base64订阅格式');
    }

    const lines = uriList.split('\n').filter(line => line.trim());
    const proxies: Proxy[] = [];

    for (const line of lines) {
      try {
        const uri = new URL(line.startsWith('http') || line.startsWith('https') ? line : `https://dummy${line}`);
        const scheme = uri.protocol.slice(0, -1);
        const name = decodeURIComponent(uri.hash.slice(1)) || 'Unnamed';
        const server = uri.hostname;
        const port = parseInt(uri.port) || 443;
        const searchParams = uri.searchParams;

        let proxy: Proxy = { name, type: scheme, server, port };

        if (scheme === 'ss') {
          const atIndex = line.indexOf('@');
          const configPart = line.slice(5, atIndex);
          const decoded = atob(configPart);
          const colonIndex = decoded.indexOf(':');
          proxy = {
            ...proxy,
            type: 'ss',
            cipher: decoded.slice(0, colonIndex),
            password: decoded.slice(colonIndex + 1),
          };
        } else if (scheme === 'vmess') {
          const base64 = line.slice(8);
          const decodedStr = atob(base64);
          const decoded = JSON.parse(decodedStr);
          proxy = {
            ...proxy,
            type: 'vmess',
            uuid: decoded.id,
            alterId: decoded.aid,
            network: decoded.net || 'tcp',
            tls: decoded.tls === 'tls',
            sni: decoded.sni || '',
          };
        } else if (scheme === 'vless') {
          proxy = {
            ...proxy,
            type: 'vless',
            uuid: uri.username,
            network: searchParams.get('type') || 'tcp',
            tls: searchParams.get('security') === 'tls',
            sni: searchParams.get('sni') || '',
          };
        } else if (scheme === 'hysteria2') {
          proxy = {
            ...proxy,
            type: 'hy2',
            password: uri.username,
            sni: searchParams.get('sni') || '',
          };
        } else if (scheme === 'tuic') {
          proxy = {
            ...proxy,
            type: 'tuic',
            password: uri.username,
            sni: searchParams.get('sni') || '',
          };
        }

        proxies.push(proxy);
      } catch (e) {
        continue;
      }
    }

    if (proxies.length === 0) throw new Error('未找到有效节点');
    const clashConfig = { proxies };
    return yaml.dump(clashConfig);
  };

  const handleConvert = async () => {
    if (!input.trim()) {
      setError('请输入内容');
      return;
    }
    setLoading(true);
    setError('');
    setResult('');

    try {
      let conversionResult: string;
      if (direction === 'clash-to-v2ray') {
        conversionResult = await clashToV2ray(input);
      } else {
        conversionResult = await v2rayToClash(input);
      }
      setResult(conversionResult);
    } catch (err: any) {
      setError(err.message || '转换失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-center mb-8">Clash ↔ V2ray 订阅转换器 (简化版)</h1>
        <p className="text-center text-gray-600 mb-4">支持基本ss/vmess/vless/hy2/tuic转换 (忽略高级opts如ws/path/alpn/plugin, 兼容V2rayN/Clash Meta)。远程URL可能受CORS限制，请优先粘贴内容。</p>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">转换方向</label>
            <select
              value={direction}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setDirection(e.target.value as 'clash-to-v2ray' | 'v2ray-to-clash')}
              className="w-full p-2 border rounded"
            >
              <option value="clash-to-v2ray">Clash YAML → V2ray base64 订阅</option>
              <option value="v2ray-to-clash">V2ray base64 订阅 → Clash YAML</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">订阅链接、YAML 或 base64 内容</label>
            <textarea
              value={input}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              placeholder={direction === 'clash-to-v2ray' 
                ? '粘贴 Clash YAML 内容，或输入远程 YAML URL...' 
                : '粘贴 V2ray base64 订阅，或输入远程 base64 URL...'}
              className="w-full p-3 border rounded h-40 resize-none"
            />
          </div>

          <button
            onClick={handleConvert}
            disabled={loading || !input.trim()}
            className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '转换中...' : '开始转换'}
          </button>

          {error && (
            <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              错误: {error}
            </div>
          )}

          {result && (
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">
                转换结果 {direction === 'clash-to-v2ray' ? '(V2ray base64 订阅, basic URI: ss://, vmess://, vless://, hysteria2://, tuic://)' : '(Clash YAML)'}
              </label>
              <textarea
                value={result}
                readOnly
                className="w-full p-3 border rounded h-40 resize-none font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                {direction === 'clash-to-v2ray' 
                  ? '复制此 base64 字符串, 直接作为 V2ray 订阅 URL 导入客户端 (如 V2rayN/Clash Meta), 解码后为基本 URI 节点列表 (ss://, vmess://, vless://, hysteria2://, tuic://), 支持 emoji 名称, 忽略高级配置如 ws/path/alpn/plugin 等。' 
                  : '复制此 YAML 内容, 保存为 .yaml 文件导入 Clash, 支持基本解析 URI 参数到 type/server/port/password/uuid/alterId/cipher/network/tls/sni 等。'}
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>部署到 Vercel 后, 即可在线使用。支持基本 ss/vmess/vless/hy2/tuic 转换。</p>
        </div>
      </div>
    </main>
  );
}
