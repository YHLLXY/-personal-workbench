/**
 * 版本更新日志（今日概览弹窗底部展示）
 * 发版约定：每次发布新版本，在数组【顶部】插入一条（最新在前）。
 * 同步更新 README.md 的「更新日志」区块，保持两处一致。
 */
export interface ChangelogEntry {
  version: string
  date: string // YYYY-MM-DD
  title: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v1.4',
    date: '2026-08-08',
    title: '定时提醒通知 + 今日概览',
    items: [
      '任务准点提醒与考试倒计时提醒（考前 3 天 / 1 天 / 1 小时）',
      '提醒中心 + 首页横幅 + 导航角标',
      '通知设置：Web Push 订阅 / Server酱 微信推送 / 测试发送',
      '打开应用弹出今日概览（待办进度 + 考试倒计时 + 更新日志）',
      '任务与考试支持设定具体时间',
    ],
  },
  {
    version: 'v1.3',
    date: '2026-08-05',
    title: '体验打磨',
    items: [
      '命令面板分组与快捷键提示',
      '主题跟随系统三态',
      '全局快捷键（⌘N / ⌘⇧N / ⌘⇧X / ⌘,）',
      '快捷键说明、首次引导',
    ],
  },
  {
    version: 'v1.2',
    date: '2026-08-05',
    title: '产品级升级',
    items: [
      '个人中心（昵称 / 头像色 / 数据统计 / 修改密码）',
      '备份导出 / 导入恢复（本地↔云端迁移闭环）',
      '今日概览条 + 本周趋势卡',
    ],
  },
  {
    version: 'v1.1',
    date: '2026-08-05',
    title: '统一资料库',
    items: ['论文 / 文案笔记、文件夹管理、AI 总结导入'],
  },
  {
    version: 'v1.0.0',
    date: '2026-08-04',
    title: '首个版本',
    items: ['5 大主模块 + PWA + 双端适配'],
  },
]
