'use client';

import React, { useState, ChangeEvent } from 'react';
import yaml from 'js-yaml';

interface Proxy {
  name: string;
  type: string;
  server: string;
  port: number;
  uuid?: string;
  alterId?: number;
  cipher?: string;
  network?: string;
  wsPath?: string;
  tls?: boolean;
  password?: string;
  // 添加更多字段根据需要，如 obfs, protocol for SSR (但忽略)
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
      if (proxy.type === 'vmess') {
        const vmessConfig = {
          v: '2',
          ps: proxy.name,
          add: proxy.server,
          port: proxy.port,
          id: proxy.uuid,
          aid: proxy.alterId || 0,
          net: proxy.network || 'tcp',
          type: 'none',
          host: '',
          path: proxy.wsPath || '',
          tls: proxy.tls ? 'tls' : '',
        };
        const vmessStr = JSON.stringify(vmessConfig);
        const base64 = btoa(unescape(encodeURIComponent(vmessStr))); // 处理Unicode
        nodeUri = `vmess://${base64}`;
      } else if (proxy.type === 'ss') {
        const methodPassword = `${proxy.cipher}:${proxy.password}`;
        const base64Auth = btoa(unescape(encodeURIComponent(methodPassword)));
        const encodedName = encodeURIComponent(proxy.name);
        nodeUri = `ss://${base64Auth}@${proxy.server}:${proxy.port}#${encodedName}`;
      } else if (proxy.type === 'ssr') {
        // SSR转标准SS，忽略obfs/protocol
        const methodPassword = `${proxy.cipher}:${proxy.password}`;
        const base64Auth = btoa(unescape(encodeURIComponent(methodPassword)));
        const encodedName = encodeURIComponent(proxy.name);
        nodeUri = `ss://${base64Auth}@${proxy.server}:${proxy.port}#${encodedName}`;
      }
      // 可以添加trojan, vless等
      if (nodeUri) v2rayNodes.push(nodeUri);
    }

    if (v2rayNodes.length === 0) throw new Error('未找到有效节点');
    const uriList = v2rayNodes.join('\n');
    return btoa(unescape(encodeURIComponent(uriList))); // base64订阅
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
      if (line.startsWith('vmess://')) {
        try {
          const base64 = line.slice(8);
          const decodedStr = atob(base64);
          const decoded = JSON.parse(decodedStr);
          const proxy: Proxy = {
            name: decoded.ps || 'Unnamed',
            type: 'vmess',
            server: decoded.add,
            port: parseInt(decoded.port),
            uuid: decoded.id,
            alterId: decoded.aid,
            cipher: 'auto',
            network: decoded.net || 'tcp',
            wsPath: decoded.path,
            tls: decoded.tls === 'tls',
          };
          proxies.push(proxy);
        } catch (e) {
          continue;
        }
      } else if (line.startsWith('ss://')) {
        const uri = line.slice(5);
        const hashIndex = uri.indexOf('#');
        let name = 'Unnamed';
        let serverPart = uri;
        if (hashIndex !== -1) {
          name = decodeURIComponent(uri.slice(hashIndex + 1));
          serverPart = uri.slice(0, hashIndex);
        }
        const atIndex = serverPart.indexOf('@');
        if (atIndex !== -1) {
          const configPart = serverPart.slice(0, atIndex);
          const serverPort = serverPart.slice(atIndex + 1);
          const [server, portStr] = serverPort.split(':');
          if (server && portStr) {
            try {
              const decoded = atob(configPart);
              const colonIndex = decoded.indexOf(':');
              if (colonIndex !== -1) {
                const method = decoded.slice(0, colonIndex);
                const password = decoded.slice(colonIndex + 1);
                const proxy: Proxy = {
                  name,
                  type: 'ss',
                  server,
                  port: parseInt(portStr, 10),
                  cipher: method,
                  password,
                };
                proxies.push(proxy);
              }
            } catch (e) {
              continue;
            }
          }
        }
      }
      // 可以添加更多类型
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
        <h1 className="text-3xl font-bold text-center mb-8">Clash ↔ V2ray 订阅转换器 (纯前端版)</h1>
        <p className="text-center text-gray-600 mb-4">参考 subconverter 实现，支持 VMess/SS/SSR 转换。远程 URL 可能受 CORS 限制，请优先粘贴内容。</p>
        
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
                转换结果 {direction === 'clash-to-v2ray' ? '(V2ray base64 订阅，一行base64编码的URI列表)' : '(Clash YAML)'}
              </label>
              <textarea
                value={result}
                readOnly
                className="w-full p-3 border rounded h-40 resize-none font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                {direction === 'clash-to-v2ray' 
                  ? '复制此 base64 字符串，直接作为 V2ray 订阅 URL 导入客户端 (如 V2rayN)，解码后为 ss:// 或 vmess:// 节点列表，支持 emoji 名称。SSR 已转换为标准 SS。' 
                  : '复制此 YAML 内容，保存为 .yaml 文件导入 Clash。'}
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>部署到 Vercel 后，即可在线使用。参考 subconverter 开源项目实现。</p>
        </div>
      </div>
    </main>
  );
}
