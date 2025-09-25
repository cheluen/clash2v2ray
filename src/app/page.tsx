'use client';

import React, { useState, ChangeEvent } from 'react';
import yaml from 'js-yaml';

interface Proxy {
  name: string;
  type: string; // vmess, ss, ssr, trojan, vless, snell, hysteria2, hy2, shadowsocks
  server: string;
  port: number;
  uuid?: string; // vmess, vless
  alterId?: number; // vmess
  cipher?: string; // ss, vmess
  password?: string; // ss, ssr, trojan, hysteria2
  network?: string; // tcp, ws, grpc, http, h2, kcp
  wsOpts?: {
    path?: string;
    headers?: { Host?: string };
  };
  h2Opts?: {
    host?: string[];
    path?: string;
  };
  httpOpts?: {
    path?: string[];
    headers?: { Host?: string[] };
  };
  grpcOpts?: {
    grpcServiceName?: string;
  };
  tcpOpts?: {
    header?: {
      type?: 'http';
      request?: {
        headers?: { Host?: string[] };
        path?: string[];
      };
    };
  };
  tls?: boolean | {
    enabled?: boolean;
    sni?: string;
    alpn?: string | string[];
    skipVerify?: boolean;
  };
  udp?: boolean;
  // SSR
  protocol?: string;
  obfs?: string;
  protocolParam?: string;
  obfsParam?: string;
  // SS plugin
  plugin?: 'obfs' | 'v2ray-plugin';
  pluginOpts?: {
    mode?: string;
    host?: string;
    tls?: boolean;
  };
  // VLESS
  flow?: string;
  // Hysteria2
  auth?: string; // fallback password
  obfsHysteria?: string;
  obfsPassword?: string;
  fingerprint?: string;
  // Snell
  psk?: string;
  obfsSnell?: string;
  obfsHost?: string;
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
      const net = proxy.network || 'tcp';
      const isTls = typeof proxy.tls === 'boolean' ? proxy.tls : (proxy.tls as any)?.enabled || false;
      const sni = (proxy.tls as any)?.sni || proxy.servername || proxy.server || '';
      const skipVerify = (proxy.tls as any)?.skipVerify || false;
      const alpn = (proxy.tls as any)?.alpn;
      let alpnStr = '';
      if (alpn) {
        if (Array.isArray(alpn)) alpnStr = `&alpn=${alpn.join(',')}`;
        else alpnStr = `&alpn=${alpn}`;
      }

      if (proxy.type === 'vmess') {
        let host = '';
        let path = '';
        let type = 'none';
        if (net === 'ws') {
          const wsOpts = proxy['ws-opts'] || proxy.wsOpts || {};
          host = wsOpts.headers?.Host || proxy['ws-headers']?.Host || proxy.servername || '';
          path = wsOpts.path || proxy['ws-path'] || proxy.path || '';
          type = 'ws';
        } else if (net === 'h2') {
          const h2Opts = proxy['h2-opts'] || {};
          host = Array.isArray(h2Opts.host) ? h2Opts.host[0] || '' : h2Opts.host || '';
          path = h2Opts.path || '';
          type = 'http';
        } else if (net === 'http') {
          const httpOpts = proxy['http-opts'] || {};
          host = Array.isArray(httpOpts.headers?.Host) ? httpOpts.headers.Host[0] || '' : httpOpts.headers?.Host || '';
          path = Array.isArray(httpOpts.path) ? httpOpts.path[0] || '' : httpOpts.path || '';
          type = 'http';
        } else if (net === 'grpc') {
          const grpcOpts = proxy['grpc-opts'] || {};
          path = grpcOpts.grpcServiceName || '';
          type = 'grpc';
        }
        const vmessConfig = {
          v: '2',
          ps: proxy.name,
          add: proxy.server,
          port: proxy.port,
          id: proxy.uuid || '',
          aid: proxy.alterId || 0,
          net: net,
          type: type,
          host: host,
          path: path,
          tls: isTls ? 'tls' : '',
          sni: sni,
          alpn: alpnStr ? alpnStr.slice(1) : '', // alpn without &
        };
        const vmessStr = JSON.stringify(vmessConfig);
        const base64 = btoa(unescape(encodeURIComponent(vmessStr)));
        nodeUri = `vmess://${base64}`;
      } else if (proxy.type === 'ss' || proxy.type === 'shadowsocks') {
        const method = proxy.cipher || 'aes-128-gcm';
        const password = proxy.password || '';
        const methodPassword = `${method}:${password}`;
        const base64Auth = btoa(unescape(encodeURIComponent(methodPassword)));
        let pluginStr = '';
        if (proxy.plugin) {
          const pluginOpts = proxy.pluginOpts || {};
          if (proxy.plugin === 'obfs') {
            const opts = [];
            if (pluginOpts.mode) opts.push(`obfs=${pluginOpts.mode}`);
            if (pluginOpts.host) opts.push(`obfs-host=${pluginOpts.host}`);
            pluginStr = `;plugin=obfs-local;${opts.join(';')}`;
          } else if (proxy.plugin === 'v2ray-plugin') {
            const opts = [];
            if (pluginOpts.mode) opts.push(`mode=${pluginOpts.mode}`);
            if (pluginOpts.host) opts.push(`host=${pluginOpts.host}`);
            if (pluginOpts.tls) opts.push('tls');
            pluginStr = `;plugin=v2ray-plugin;${opts.join(';')}`;
          }
        }
        nodeUri = `ss://${base64Auth}@${proxy.server}:${proxy.port}${pluginStr}#${encodedName}`;
      } else if (proxy.type === 'ssr') {
        // SSR转标准SS，忽略高级
        const method = proxy.cipher || 'aes-128-gcm';
        const password = proxy.password || '';
        const methodPassword = `${method}:${password}`;
        const base64Auth = btoa(unescape(encodeURIComponent(methodPassword)));
        nodeUri = `ss://${base64Auth}@${proxy.server}:${proxy.port}#${encodedName}`;
      } else if (proxy.type === 'trojan') {
        let trojanParams = `sni=${encodeURIComponent(sni)}`;
        if (alpnStr) trojanParams += alpnStr;
        let networkParams = '';
        if (net === 'ws') {
          const wsOpts = proxy['ws-opts'] || proxy.wsOpts || {};
          const wsHost = wsOpts.headers?.Host || '';
          const wsPath = wsOpts.path || '';
          networkParams = `&type=ws`;
          if (wsHost) networkParams += `&host=${encodeURIComponent(wsHost)}`;
          if (wsPath) networkParams += `&path=${encodeURIComponent(wsPath)}`;
        } else if (net === 'grpc') {
          const grpcOpts = proxy['grpc-opts'] || {};
          const serviceName = grpcOpts.grpcServiceName || '';
          networkParams = `&type=grpc`;
          if (serviceName) networkParams += `&serviceName=${encodeURIComponent(serviceName)}`;
        }
        trojanParams += networkParams;
        if (skipVerify) trojanParams += '&insecure=1';
        const password = proxy.password || '';
        nodeUri = `trojan://${encodeURIComponent(password)}@${proxy.server}:${proxy.port}?${trojanParams}#${encodedName}`;
      } else if (proxy.type === 'vless') {
        let vlessParams = `encryption=none&security=${isTls ? 'tls' : 'none'}`;
        if (sni) vlessParams += `&sni=${encodeURIComponent(sni)}`;
        if (alpnStr) vlessParams += alpnStr;
        let flowParam = proxy.flow ? `&flow=${proxy.flow}` : '';
        let networkParams = '';
        if (net === 'ws') {
          const wsOpts = proxy['ws-opts'] || proxy.wsOpts || {};
          const wsHost = wsOpts.headers?.Host || '';
          const wsPath = wsOpts.path || '';
          networkParams = `&type=ws`;
          if (wsHost) networkParams += `&host=${encodeURIComponent(wsHost)}`;
          if (wsPath) networkParams += `&path=${encodeURIComponent(wsPath)}`;
        } else if (net === 'grpc') {
          const grpcOpts = proxy['grpc-opts'] || {};
          const serviceName = grpcOpts.grpcServiceName || '';
          networkParams = `&type=grpc`;
          if (serviceName) networkParams += `&serviceName=${encodeURIComponent(serviceName)}`;
        } else if (net === 'tcp') {
          const tcpOpts = proxy.tcpOpts || {};
          if (tcpOpts.header?.type === 'http') {
            const req = tcpOpts.header.request || {};
            const tcpHost = Array.isArray(req.headers?.Host) ? req.headers.Host[0] || '' : req.headers?.Host || '';
            const tcpPath = Array.isArray(req.path) ? req.path[0] || '' : req.path || '';
            networkParams = `&type=tcp&headerType=http`;
            if (tcpHost) networkParams += `&host=${encodeURIComponent(tcpHost)}`;
            if (tcpPath) networkParams += `&path=${encodeURIComponent(tcpPath)}`;
          }
        }
        vlessParams += `&type=${net}${networkParams}${flowParam}`;
        if (skipVerify) vlessParams += '&allowInsecure=1';
        const uuid = proxy.uuid || '';
        nodeUri = `vless://${encodeURIComponent(uuid)}@${proxy.server}:${proxy.port}?${vlessParams}#${encodedName}`;
      } else if (proxy.type === 'hysteria2' || proxy.type === 'hy2' || proxy.type === 'hysteria') {
        let hystParams = `sni=${encodeURIComponent(sni)}`;
        const password = proxy.password || proxy.auth || '';
        const obfs = proxy.obfs || '';
        const obfsPassword = proxy.obfsPassword || proxy['obfs-param'] || '';
        if (obfs) hystParams += `&obfs=${obfs}`;
        if (obfsPassword) hystParams += `&obfs-password=${encodeURIComponent(obfsPassword)}`;
        if (alpnStr) hystParams += alpnStr;
        if (skipVerify) hystParams += '&insecure=1';
        const fingerprint = proxy.fingerprint || '';
        if (fingerprint) hystParams += `&pinSHA256=${fingerprint}`;
        nodeUri = `hysteria2://${encodeURIComponent(password)}@${proxy.server}:${proxy.port}?${hystParams}#${encodedName}`;
      } else if (proxy.type === 'snell') {
        const psk = proxy.psk || '';
        const pskB64 = btoa(unescape(encodeURIComponent(psk)));
        let snellParams = '';
        const obfsSnell = proxy.obfsSnell || '';
        if (obfsSnell === 'http') snellParams = 'obfs=http';
        const obfsHost = proxy.obfsHost || '';
        if (obfsHost) snellParams += `&obfs-host=${encodeURIComponent(obfsHost)}`;
        nodeUri = `snell://${pskB64}@${proxy.server}:${proxy.port}?${snellParams}#${encodedName}`;
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
          // SSR URI: ss://btoa(method:pass:protocol:obfs:b64(protparam):b64(obfsparam))@server:port#name
          const atIndex = line.indexOf('@');
          const hashIndex = line.indexOf('#');
          const configB64 = line.slice(5, atIndex);
          let serverPortName = line.slice(atIndex + 1);
          let name = proxy.name; // Use existing name if not overridden
          if (hashIndex !== -1) {
            name = decodeURIComponent(serverPortName.slice(hashIndex + 1));
            serverPortName = serverPortName.slice(0, hashIndex);
          }
          const [server, portStr] = serverPortName.split(':');
          if (server && portStr) {
            try {
              const fullConfig = atob(configB64);
              const configParts = fullConfig.split(':'); // [method, pass, protocol, obfs, protB64, obfsB64]
              if (configParts.length >= 2) { // At least method:pass
                const [cipher, password, protocol = 'origin', obfs = 'plain', protParamB64 = '', obfsParamB64 = ''] = configParts;
                proxy = {
                  ...proxy,
                  name,
                  type: 'ssr',
                  server,
                  port: parseInt(portStr),
                  cipher,
                  password,
                  protocol,
                  obfs,
                  protocolParam: protParamB64 ? atob(protParamB64) : '',
                  obfsParam: obfsParamB64 ? atob(obfsParamB64) : '',
                };
              }
            } catch (e) {
              // Fallback to SS if parse fails
              proxy.type = 'ss';
              // Re-parse as SS
              const ssAtIndex = line.indexOf('@');
              const ssConfigPart = line.slice(5, ssAtIndex);
              const ssDecoded = atob(ssConfigPart);
              const ssColonIndex = ssDecoded.indexOf(':');
              if (ssColonIndex !== -1) {
                proxy.cipher = ssDecoded.slice(0, ssColonIndex);
                proxy.password = ssDecoded.slice(ssColonIndex + 1);
              }
            }
          }
          // 可选：转成ss忽略高级 for URI generation, but parse full for Clash
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
        } else if (scheme === 'hysteria' || scheme === 'hysteria2') {
          proxy = {
            ...proxy,
            type: 'hysteria2',
            password: uri.username, // or auth
            obfsHysteria: searchParams.get('obfs') || '',
            obfsPassword: searchParams.get('obfs-password') || '',
          };
          if (searchParams.has('sni')) {
            proxy.tls = { sni: searchParams.get('sni') || server };
          }
          if (searchParams.has('alpn')) {
            const alpnVal = searchParams.get('alpn');
            (proxy.tls as any).alpn = alpnVal ? alpnVal.split(',') : ['h3'];
          }
          if (searchParams.has('insecure') && searchParams.get('insecure') === '1') {
            (proxy.tls as any).skipVerify = true;
          }
          if (searchParams.has('pinSHA256')) {
            proxy.fingerprint = searchParams.get('pinSHA256') || undefined;
          }
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
                  ? '复制此 base64 字符串，直接作为 V2ray 订阅 URL 导入客户端 (如 V2rayN/Clash Meta)，解码后为标准 URI 节点列表 (vmess://, ss:// with plugin, trojan:// with alpn/ws, vless:// with flow, hysteria2:// with obfs/alpn/insecure 等)，支持 emoji 名称、高级配置。SSR 已转换为标准 SS。' 
                  : '复制此 YAML 内容，保存为 .yaml 文件导入 Clash，支持解析 URI 参数到 ws-opts/tls/pluginOpts/flow/fingerprint 等高级字段。'}
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
