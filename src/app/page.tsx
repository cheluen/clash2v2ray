'use client';

import React, { useState, ChangeEvent } from 'react';
import yaml from 'js-yaml';

interface Proxy {
  name: string;
  type: string; // vmess, ss, ssr, trojan, vless, snell, hysteria, shadowsocks
  server: string;
  port: number;
  uuid?: string; // vmess, vless
  alterId?: number; // vmess
  cipher?: string; // ss, vmess
  password?: string; // ss, ssr, trojan
  network?: string; // vmess: tcp, ws, grpc, http, kcp, quic
  wsOpts?: {
    path?: string;
    headers?: { Host?: string };
  }; // vmess ws/grpc/http
  tls?: boolean | {
    enabled?: boolean;
    sni?: string;
    alpn?: string[];
    skipVerify?: boolean;
  }; // vmess, trojan, vless
  udp?: boolean; // general
  // SSR specific
  protocol?: string; // origin, auth_sha1_v4 等 (忽略 for URI, but parse)
  obfs?: string; // plain, http_simple 等 (忽略)
  protocolParam?: string;
  obfsParam?: string;
  // Trojan specific (tls above covers)
  // Snell
  psk?: string;
  obfsSnell?: string; // http, tls
  obfsHost?: string;
  // Hysteria
  auth?: string;
  obfsHysteria?: string; // ws
  obfsPath?: string;
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
      const encodedName = encodeURIComponent(proxy.name);
      const isTls = typeof proxy.tls === 'boolean' ? proxy.tls : (proxy.tls as any)?.enabled || false;
      const sni = typeof proxy.tls === 'object' ? (proxy.tls as any).sni : proxy.server;
      const skipVerify = typeof proxy.tls === 'object' ? (proxy.tls as any).skipVerify : false;
      const wsOpts = proxy['ws-opts'] || proxy.wsOpts || {};
      const path = wsOpts.path || '';
      const host = wsOpts.headers?.Host || '';
      const net = proxy.network || 'tcp';
      const type = net === 'ws' ? 'ws' : net === 'grpc' ? 'grpc' : net === 'http' ? 'http' : 'none';

      if (proxy.type === 'vmess') {
        const vmessConfig = {
          v: '2',
          ps: proxy.name,
          add: proxy.server,
          port: proxy.port,
          id: proxy.uuid || '',
          aid: proxy.alterId || 0,
          scy: proxy.cipher || 'auto',
          net: net,
          type: type,
          host: host,
          path: path,
          tls: isTls ? 'tls' : '',
          sni: sni,
          alpn: (proxy.tls as any)?.alpn || ['http/1.1'],
        };
        const vmessStr = JSON.stringify(vmessConfig);
        const base64 = btoa(unescape(encodeURIComponent(vmessStr)));
        nodeUri = `vmess://${base64}`;
      } else if (proxy.type === 'ss' || proxy.type === 'shadowsocks') {
        const methodPassword = `${proxy.cipher || 'aes-128-gcm'}:${proxy.password || ''}`;
        const base64Auth = btoa(unescape(encodeURIComponent(methodPassword)));
        nodeUri = `ss://${base64Auth}@${proxy.server}:${proxy.port}#${encodedName}`;
      } else if (proxy.type === 'ssr') {
        // SSR转标准SS，忽略obfs/protocol/obfs-param/protocol-param
        const methodPassword = `${proxy.cipher || 'aes-128-gcm'}:${proxy.password || ''}`;
        const base64Auth = btoa(unescape(encodeURIComponent(methodPassword)));
        nodeUri = `ss://${base64Auth}@${proxy.server}:${proxy.port}#${encodedName}`;
      } else if (proxy.type === 'trojan') {
        let trojanParams = `security=tls&sni=${encodeURIComponent(sni || '')}`;
        if (skipVerify) trojanParams += '&allowInsecure=1';
        if (net === 'ws') {
          trojanParams += `&type=ws&host=${encodeURIComponent(host)}&path=${encodeURIComponent(path)}`;
        }
        nodeUri = `trojan://${encodeURIComponent(proxy.password || '')}@${proxy.server}:${proxy.port}?${trojanParams}#${encodedName}`;
      } else if (proxy.type === 'vless') {
        let vlessParams = `encryption=none&security=tls&sni=${encodeURIComponent(sni || '')}`;
        if (skipVerify) vlessParams += '&allowInsecure=1';
        if (net === 'ws') {
          vlessParams += `&type=ws&host=${encodeURIComponent(host)}&path=${encodeURIComponent(path)}`;
        }
        nodeUri = `vless://${encodeURIComponent(proxy.uuid || '')}@${proxy.server}:${proxy.port}?${vlessParams}#${encodedName}`;
      } else if (proxy.type === 'snell') {
        const pskBase64 = btoa(unescape(encodeURIComponent(proxy.psk || '')));
        let snellParams = '';
        if (proxy.obfsSnell === 'http') snellParams = 'obfs=http';
        if (proxy.obfsHost) snellParams += `&obfs-host=${encodeURIComponent(proxy.obfsHost)}`;
        nodeUri = `snell://${pskBase64}@${proxy.server}:${proxy.port}?${snellParams}#${encodedName}`;
      } else if (proxy.type === 'hysteria' || proxy.type === 'hysteria2') {
        let hystParams = `sni=${encodeURIComponent(sni || '')}`;
        if (proxy.auth) hystParams += `&auth=${encodeURIComponent(proxy.auth)}`;
        if (proxy.obfsHysteria === 'ws' && proxy.obfsPath) hystParams += `&obfs=ws&obfs-path=${encodeURIComponent(proxy.obfsPath)}`;
        nodeUri = `hysteria://${encodeURIComponent(proxy.auth || '')}@${proxy.server}:${proxy.port}?${hystParams}#${encodedName}`;
      }
      // 支持更多如 tuic, wireguard if Clash supports
      if (nodeUri) v2rayNodes.push(nodeUri);
    }

    if (v2rayNodes.length === 0) throw new Error('未找到有效节点');
    const uriList = v2rayNodes.join('\n');
    return btoa(unescape(encodeURIComponent(uriList))); // base64订阅 (mixed格式)
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
        const scheme = uri.protocol.slice(0, -1); // remove :
        const name = decodeURIComponent(uri.hash.slice(1)) || 'Unnamed';
        const server = uri.hostname;
        const port = parseInt(uri.port) || 443;
        const searchParams = uri.searchParams;

        let proxy: Proxy = { name, type: scheme, server, port };

        if (scheme === 'vmess') {
          const base64 = line.slice(8);
          const decodedStr = atob(base64);
          const decoded = JSON.parse(decodedStr);
          proxy = {
            ...proxy,
            type: 'vmess',
            uuid: decoded.id,
            alterId: decoded.aid,
            cipher: decoded.scy || 'auto',
            network: decoded.net || 'tcp',
            wsOpts: {
              path: decoded.path || '',
              headers: { Host: decoded.host || '' }
            },
            tls: decoded.tls === 'tls' || !!decoded.sni,
          };
          if (typeof proxy.tls === 'boolean' && proxy.tls) {
            (proxy.tls as any) = { sni: decoded.sni || server, alpn: decoded.alpn ? decoded.alpn.split(',') : ['http/1.1'] };
          }
        } else if (scheme === 'ss') {
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
        } else if (scheme === 'ssr') {
          // SSR URI: ss://method:pass@server:port:protocol:obfs:base64(protocol-param):base64(obfs-param)#name
          const parts = line.slice(5).split('@')[1].split(':');
          const [serverPort, protocol, obfs, protParamB64, obfsParamB64] = parts;
          const [serv, prt] = serverPort.split(':');
          const methodPass = atob(line.slice(5, line.indexOf('@'))); // method:pass
          const [cipher, password] = methodPass.split(':');
          proxy = {
            ...proxy,
            type: 'ssr',
            cipher,
            password,
            server: serv,
            port: parseInt(prt),
            protocol,
            obfs,
            protocolParam: protParamB64 ? atob(protParamB64) : '',
            obfsParam: obfsParamB64 ? atob(obfsParamB64) : '',
          };
          // 可选：转成ss忽略高级
        } else if (scheme === 'trojan') {
          proxy = {
            ...proxy,
            type: 'trojan',
            password: uri.username, // password in username
            tls: true,
          };
          if (searchParams.has('sni')) (proxy.tls as any).sni = searchParams.get('sni');
          if (searchParams.has('allowInsecure')) (proxy.tls as any).skipVerify = searchParams.get('allowInsecure') === '1';
          if (searchParams.has('type') && searchParams.get('type') === 'ws') {
            proxy.network = 'ws';
            proxy.wsOpts = { path: searchParams.get('path') || '', headers: { Host: searchParams.get('host') || '' } };
          }
        } else if (scheme === 'vless') {
          proxy = {
            ...proxy,
            type: 'vless',
            uuid: uri.username,
            network: searchParams.get('type') || 'tcp',
            tls: searchParams.get('security') === 'tls',
          };
          if (proxy.tls) {
            (proxy.tls as any) = { sni: searchParams.get('sni') || server };
            if (searchParams.has('allowInsecure')) (proxy.tls as any).skipVerify = searchParams.get('allowInsecure') === '1';
          }
          if (proxy.network === 'ws') {
            proxy.wsOpts = { path: searchParams.get('path') || '', headers: { Host: searchParams.get('host') || '' } };
          }
        } else if (scheme === 'snell') {
          const psk = atob(uri.username);
          proxy = {
            ...proxy,
            type: 'snell',
            psk,
            obfsSnell: searchParams.get('obfs') || '',
            obfsHost: searchParams.get('obfs-host') || '',
          };
        } else if (scheme === 'hysteria') {
          proxy = {
            ...proxy,
            type: 'hysteria',
            auth: uri.username,
            obfsHysteria: searchParams.get('obfs') || '',
            obfsPath: searchParams.get('obfs-path') || '',
          };
          if (searchParams.has('sni')) (proxy.tls as any) = { sni: searchParams.get('sni') };
        }
        // 添加更多如 tuic
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
        <h1 className="text-3xl font-bold text-center mb-8">Clash ↔ V2ray 订阅转换器 (纯前端版)</h1>
        <p className="text-center text-gray-600 mb-4">参考 subconverter 实现，支持 VMess/SS/SSR/Trojan/VLESS/Snell/Hysteria 等全面节点类型转换 (mixed base64 URI 列表，兼容 V2rayN)。远程 URL 可能受 CORS 限制，请优先粘贴内容。</p>
        
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
                转换结果 {direction === 'clash-to-v2ray' ? '(V2ray base64 订阅，mixed格式：一行base64编码的URI列表，支持全面节点类型)' : '(Clash YAML)'}
              </label>
              <textarea
                value={result}
                readOnly
                className="w-full p-3 border rounded h-40 resize-none font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                {direction === 'clash-to-v2ray' 
                  ? '复制此 base64 字符串，直接作为 V2ray 订阅 URL 导入客户端 (如 V2rayN/Clash Meta)，解码后为标准 URI 节点列表 (vmess://, ss://, trojan:// 等)，支持 emoji 名称、WS/TLS 等高级配置。SSR 已转换为标准 SS。' 
                  : '复制此 YAML 内容，保存为 .yaml 文件导入 Clash，支持解析高级 URI 参数到 ws-opts/tls 等。'}
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
