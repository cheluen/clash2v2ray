import { NextRequest, NextResponse } from 'next/server';
import yaml from 'js-yaml';
import axios from 'axios';

interface ConvertRequest {
  input: string;
  direction: 'clash-to-v2ray' | 'v2ray-to-clash';
}

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
  // 添加更多字段根据需要
}

export async function POST(request: NextRequest) {
  try {
    const { input, direction }: ConvertRequest = await request.json();

    let content = input.trim();

    // 如果是远程链接，fetch内容
    if (content.startsWith('http')) {
      const response = await axios.get(content);
      content = response.data;
    }

    let result: string;

    if (direction === 'clash-to-v2ray') {
      // Clash YAML to V2ray base64
      let clashConfig;
      try {
        clashConfig = yaml.load(content) as any;
      } catch (e) {
        return NextResponse.json({ error: '无效的Clash YAML格式' }, { status: 400 });
      }

      const proxies = clashConfig.proxies || [];
      const v2rayNodes: string[] = [];

      for (const proxy of proxies) {
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
          const base64 = Buffer.from(vmessStr).toString('base64');
          v2rayNodes.push(`vmess://${base64}`);
        } else if (proxy.type === 'ss' || proxy.type === 'ssr') {
          // Shadowsocks/SSR转换到标准SS (忽略SSR的obfs/protocol)
          const methodPassword = `${proxy.cipher}:${proxy.password}`;
          const base64Auth = Buffer.from(methodPassword, 'utf8').toString('base64');
          const encodedName = encodeURIComponent(proxy.name);
          const ssStr = `ss://${base64Auth}@${proxy.server}:${proxy.port}#${encodedName}`;
          v2rayNodes.push(ssStr);
        }
        // 可以添加更多类型如trojan, vless等
      }

      // 输出base64编码的订阅链接
      const uriList = v2rayNodes.join('\n');
      result = Buffer.from(uriList, 'utf8').toString('base64');
    } else {
      // V2ray base64 to Clash YAML
      const lines = content.split('\n').filter(line => line.trim());
      const proxies: Proxy[] = [];

      for (const line of lines) {
        if (line.startsWith('vmess://')) {
          try {
            const base64 = line.slice(8);
            const decoded = JSON.parse(Buffer.from(base64, 'base64').toString());
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
          // Shadowsocks解析 (标准格式: ss://base64(method:password)@server:port#name)
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
                const decoded = Buffer.from(configPart, 'base64').toString('utf8');
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

      const clashConfig = {
        proxies,
        // 可以添加更多Clash配置
      };

      result = yaml.dump(clashConfig);
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: '转换过程中发生错误' }, { status: 500 });
  }
}
