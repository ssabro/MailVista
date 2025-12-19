import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          // 번들 최상단에 앱 이름 설정 (모든 코드보다 먼저 실행)
          banner: `require('electron').app.setName('MailVista');`
        }
      }
    }
  },
  preload: {
    // sandbox 환경에서는 externalize하지 않고 번들링해야 함
    plugins: [externalizeDepsPlugin({ exclude: ['@electron-toolkit/preload'] })]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
