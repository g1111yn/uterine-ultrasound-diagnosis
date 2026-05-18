import { useQuery } from '@tanstack/react-query'
import { Server, Cpu, Clock, Loader2, SlidersHorizontal } from 'lucide-react'
import { getHealth } from '@/api/client'
import { useAppStore } from '@/lib/store'

export default function Settings() {
  const { confidenceThreshold, setConfidenceThreshold } = useAppStore()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 30000,
  })

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h}小时 ${m}分钟`
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-text-primary mb-5">系统设置</h1>

      <div className="rounded-lg border border-border bg-bg-primary p-5 space-y-4">
        <h2 className="text-xs font-medium text-text-secondary">模型与服务状态</h2>

        {isLoading && (
          <div className="py-6 flex flex-col items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin mb-2 text-text-tertiary" />
            <span className="text-xs text-text-secondary">正在连接后端服务...</span>
          </div>
        )}

        {isError && (
          <div className="rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger-text">
            无法连接后端服务：{(error as Error).message}
          </div>
        )}

        {data && (
          <div className="space-y-2">
            {[
              {
                icon: Server,
                label: '服务状态',
                value: data.status === 'ok' ? '运行中' : '异常',
                ok: data.status === 'ok',
              },
              {
                icon: Cpu,
                label: '模型版本',
                value: data.model_version,
              },
              {
                icon: Cpu,
                label: '模型加载',
                value: data.model_loaded ? '已加载' : '未加载',
                ok: data.model_loaded,
              },
              {
                icon: Clock,
                label: '运行时间',
                value: formatUptime(data.uptime_seconds),
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 p-2.5 rounded-md bg-bg-tertiary"
              >
                <item.icon className="w-3.5 h-3.5 shrink-0 text-text-tertiary" />
                <div className="flex-1">
                  <div className="text-[11px] text-text-tertiary">{item.label}</div>
                  <div
                    className={`text-xs font-medium tabular-nums ${
                      item.ok === false
                        ? 'text-danger-text'
                        : item.ok === true
                        ? 'text-success-text'
                        : 'text-text-primary'
                    }`}
                  >
                    {item.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-bg-primary p-5 mt-4 space-y-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-text-tertiary" />
          <h2 className="text-xs font-medium text-text-primary">推理参数</h2>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-text-secondary">置信度阈值</span>
            <span className="font-medium tabular-nums text-text-primary">
              {(confidenceThreshold * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={confidenceThreshold}
            onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-bg-tertiary"
            style={{ accentColor: 'var(--color-info-text)' }}
          />
          <p className="text-[11px] text-text-tertiary">
            低于此阈值的预测结果将标记为"低置信度"
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-bg-primary p-5 mt-4 space-y-2">
        <h2 className="text-xs font-medium text-text-primary">关于</h2>
        <div className="text-xs space-y-1 text-text-secondary leading-relaxed">
          <p>子宫超声辅助诊断系统 v2</p>
          <p>
            基于 EfficientNet-B3 + 阿里达摩院医学 BERT 的图像主导门控融合模型，
            训练数据 10,587 病人 / 196,255 张超声图像（5 折交叉验证）
          </p>
          <p>
            病人级 ACC 0.849（完整诊断模式）/ 0.805（纯图像筛查），
            病人级 AUC 0.949 / 0.934
          </p>
          <p>仅供辅助诊断参考，最终诊断以医生判断为准</p>
        </div>
      </div>
    </div>
  )
}
