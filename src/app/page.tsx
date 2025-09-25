import { useState } from 'react';

export default function Home() {
  const [input, setInput] = useState('');
  const [direction, setDirection] = useState('clash-to-v2ray');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConvert = async () => {
    setLoading(true);
    setError('');
    setResult('');
    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input, direction }),
      });
      const data = await response.json();
      if (response.ok) {
        setResult(data.result);
      } else {
        setError(data.error || '转换失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
    }
    setLoading(false);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-100">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-md p-6">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">Clash V2ray 转换器</h1>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">订阅链接或 YAML 内容</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full h-32 p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="粘贴 Clash YAML 或 V2ray 订阅链接..."
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">转换方向</label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="clash-to-v2ray">Clash → V2ray (Base64)</option>
            <option value="v2ray-to-clash">V2ray → Clash (YAML)</option>
          </select>
        </div>

        <button
          onClick={handleConvert}
          disabled={loading || !input}
          className="w-full bg-blue-500 text-white py-3 rounded-md hover:bg-blue-600 disabled:bg-gray-400 font-medium"
        >
          {loading ? '转换中...' : '开始转换'}
        </button>

        {error && (
          <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">转换结果</label>
            <textarea
              value={result}
              readOnly
              className="w-full h-32 p-3 border border-gray-300 rounded-md bg-gray-50"
              placeholder="转换结果将显示在这里..."
            />
            <p className="text-xs text-gray-500 mt-2">复制以上内容到 V2ray 或 Clash 配置中使用。</p>
          </div>
        )}
      </div>
    </main>
  );
}
