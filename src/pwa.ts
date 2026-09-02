import { registerSW } from 'virtual:pwa-register'
import { capturePwaInstall } from './lib/pwa-install'

// beforeinstallprompt 启动期捕获（挂设置页会丢事件），供「我的」页安装行消费
capturePwaInstall()
registerSW({ immediate: true })
